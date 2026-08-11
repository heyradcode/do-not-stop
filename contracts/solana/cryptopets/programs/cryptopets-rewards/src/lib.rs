//! Capped, one-time SPL reward claims against a per-season Merkle root
//! (docs/battle-protocol.md §I), and the Solana counterpart to
//! `contracts/ethereum/src/SeasonRewardDistributor.sol`.
//!
//! Separate from `cryptopets_registry` on purpose: that program is the immutable record of
//! what happened and must stay minimal, while this one holds funds. Keeping the ledger away
//! from the money means a bug here cannot corrupt the history, and a pause here cannot stop
//! battles. It is also why this program keeps its upgrade authority while the registry
//! burns its own: this one will need fixes, and the registry must never be patchable.
//!
//! **What a claim proves.** Membership in a season's reward tree, and nothing more. The
//! tree is computed off chain from anchored receipts, so §I's per-battle reward cap is
//! applied there, where the battles are actually visible. What this program enforces is the
//! part that must not depend on the operator being honest: one claim per wallet per season,
//! a per-wallet ceiling, and a season total that cannot be exceeded no matter what root was
//! posted.
//!
//! That division matters. A root is operator-supplied, so treating it as authoritative for
//! *value* would make a bad root an unbounded loss. The caps bound the damage to something
//! the admin chose in advance, which is what makes posting a bad root a recoverable mistake
//! rather than a fatal one.

pub mod errors;
pub mod leaf;
pub mod state;

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use errors::ErrorCode;
use leaf::{reward_leaf, verify_proof};
use state::{Claimed, RewardsState, Season};

// PLACEHOLDER. Run `anchor keys sync` after the first `anchor build` and before any deploy.
declare_id!("RewaRDsFhqhVBHrHFHKcnbXPPHUvNSVKWnxNBXjHkVh");

/// Longest proof this program will walk.
///
/// 32 covers a tree of 2^32 leaves, which is more receipts than this game will ever settle.
/// The bound exists because proof length is caller-controlled and each step is a keccak: an
/// unbounded vector is a compute-budget exhaustion knob, and the transaction would fail
/// anyway, just later and less clearly.
const MAX_PROOF_LEN: usize = 32;

#[program]
pub mod cryptopets_rewards {
    use super::*;

    /// Creates the admin record. The signer becomes the admin.
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let rewards = &mut ctx.accounts.rewards;
        rewards.admin = ctx.accounts.admin.key();
        rewards.paused = false;
        rewards.bump = ctx.bumps.rewards;
        rewards._reserved = [0u8; 64];
        Ok(())
    }

    /// Opens a season with its root, its caps, and its window, and creates its vault.
    ///
    /// `init` on the season PDA is what makes "opened exactly once" structural rather than a
    /// check. The vault starts empty; funding it is a plain SPL transfer to a derivable
    /// address, so it needs no instruction here.
    #[allow(clippy::too_many_arguments)]
    pub fn open_season(
        ctx: Context<OpenSeason>,
        season_id: u32,
        merkle_root: [u8; 32],
        chain_ref: [u8; 32],
        per_wallet_cap: u64,
        season_cap: u64,
        claims_open_at: i64,
        claims_close_at: i64,
    ) -> Result<()> {
        require!(merkle_root != [0u8; 32], ErrorCode::EmptyRoot);
        require!(claims_close_at > claims_open_at, ErrorCode::BadClaimWindow);

        let season = &mut ctx.accounts.season;
        season.merkle_root = merkle_root;
        season.mint = ctx.accounts.mint.key();
        season.chain_ref = chain_ref;
        season.per_wallet_cap = per_wallet_cap;
        season.season_cap = season_cap;
        season.total_claimed = 0;
        season.claims_open_at = claims_open_at;
        season.claims_close_at = claims_close_at;
        season.bump = ctx.bumps.season;
        season._reserved = [0u8; 64];

        emit!(SeasonOpened {
            season_id,
            merkle_root,
            mint: season.mint,
            per_wallet_cap,
            season_cap,
            claims_open_at,
            claims_close_at,
        });
        Ok(())
    }

    /// Claims a season entitlement for `wallet`.
    ///
    /// Permissionless in who *sends* it but not in who is *paid*: the leaf binds the
    /// beneficiary and the destination token account must belong to them, so anyone may pay
    /// the fee to deliver someone else's reward and nobody can redirect it.
    ///
    /// Order is effects before interactions. The `Claimed` PDA is created and the running
    /// total updated before the transfer, so a token program that somehow re-entered would
    /// find the nullifier already taken.
    pub fn claim(
        ctx: Context<Claim>,
        season_id: u32,
        amount: u64,
        proof: Vec<[u8; 32]>,
    ) -> Result<()> {
        require!(!ctx.accounts.rewards.paused, ErrorCode::Paused);
        require!(proof.len() <= MAX_PROOF_LEN, ErrorCode::ProofTooLong);

        let now = Clock::get()?.unix_timestamp;
        let season = &mut ctx.accounts.season;
        require!(now >= season.claims_open_at, ErrorCode::ClaimsNotOpen);
        require!(now < season.claims_close_at, ErrorCode::ClaimsClosed);

        require!(amount <= season.per_wallet_cap, ErrorCode::ExceedsWalletCap);
        let remaining = season
            .season_cap
            .checked_sub(season.total_claimed)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
        require!(amount <= remaining, ErrorCode::ExceedsSeasonCap);

        // Every input to the leaf comes from this program or from account state, never from
        // the claimant: a proof built for another cluster or another distributor simply
        // hashes to a leaf that is not in this root.
        let computed = reward_leaf(
            &season.chain_ref,
            &crate::ID,
            season_id,
            &ctx.accounts.wallet.key(),
            &season.mint,
            amount,
        );
        require!(
            verify_proof(&proof, &season.merkle_root, &computed),
            ErrorCode::BadProof
        );

        ctx.accounts.claimed.bump = ctx.bumps.claimed;
        season.total_claimed = season
            .total_claimed
            .checked_add(amount)
            .ok_or(ErrorCode::ArithmeticOverflow)?;

        let season_id_seed = season_id.to_le_bytes();
        let seeds: &[&[u8]] = &[Season::SEED, &season_id_seed, &[season.bump]];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.wallet_token.to_account_info(),
                    authority: season.to_account_info(),
                },
                &[seeds],
            ),
            amount,
        )?;

        emit!(RewardClaimed {
            season_id,
            wallet: ctx.accounts.wallet.key(),
            amount,
        });
        Ok(())
    }

    /// Recovers whatever a closed season never paid out.
    ///
    /// Only after the window shuts, so it cannot pull funds out from under people who are
    /// still entitled to them.
    pub fn sweep_unclaimed(ctx: Context<SweepUnclaimed>, season_id: u32) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let season = &ctx.accounts.season;
        require!(now >= season.claims_close_at, ErrorCode::ClaimsStillOpen);

        let amount = ctx.accounts.vault.amount;
        if amount == 0 {
            return Ok(());
        }

        let season_id_seed = season_id.to_le_bytes();
        let seeds: &[&[u8]] = &[Season::SEED, &season_id_seed, &[season.bump]];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.destination.to_account_info(),
                    authority: season.to_account_info(),
                },
                &[seeds],
            ),
            amount,
        )?;

        emit!(UnclaimedSwept { season_id, amount });
        Ok(())
    }

    pub fn pause(ctx: Context<AdminOnly>) -> Result<()> {
        ctx.accounts.rewards.paused = true;
        Ok(())
    }

    pub fn unpause(ctx: Context<AdminOnly>) -> Result<()> {
        ctx.accounts.rewards.paused = false;
        Ok(())
    }

    /// Hands the admin role to `new_admin`. Single-step, matching `Ownable`.
    pub fn set_admin(ctx: Context<AdminOnly>, new_admin: Pubkey) -> Result<()> {
        let rewards = &mut ctx.accounts.rewards;
        emit!(AdminChanged {
            previous: rewards.admin,
            current: new_admin,
        });
        rewards.admin = new_admin;
        Ok(())
    }
}

// ─── Events ───────────────────────────────────────────────────────────────────

#[event]
pub struct SeasonOpened {
    pub season_id: u32,
    pub merkle_root: [u8; 32],
    pub mint: Pubkey,
    pub per_wallet_cap: u64,
    pub season_cap: u64,
    pub claims_open_at: i64,
    pub claims_close_at: i64,
}

#[event]
pub struct RewardClaimed {
    pub season_id: u32,
    pub wallet: Pubkey,
    pub amount: u64,
}

#[event]
pub struct UnclaimedSwept {
    pub season_id: u32,
    pub amount: u64,
}

#[event]
pub struct AdminChanged {
    pub previous: Pubkey,
    pub current: Pubkey,
}

// ─── Accounts ─────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = admin,
        seeds = [RewardsState::SEED],
        bump,
        space = RewardsState::SPACE,
    )]
    pub rewards: Account<'info, RewardsState>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(season_id: u32)]
pub struct OpenSeason<'info> {
    #[account(
        seeds = [RewardsState::SEED],
        bump = rewards.bump,
        has_one = admin @ ErrorCode::Unauthorized,
    )]
    pub rewards: Account<'info, RewardsState>,

    #[account(mut)]
    pub admin: Signer<'info>,

    /// `init` is what makes a season openable exactly once, even by the admin.
    #[account(
        init,
        payer = admin,
        seeds = [Season::SEED, &season_id.to_le_bytes()],
        bump,
        space = Season::SPACE,
    )]
    pub season: Account<'info, Season>,

    pub mint: Account<'info, Mint>,

    /// Holds this season's payout. Its authority is the season PDA, so only this program
    /// can move tokens out of it, and only through `claim` or `sweep_unclaimed`.
    #[account(
        init,
        payer = admin,
        seeds = [Season::VAULT_SEED, &season_id.to_le_bytes()],
        bump,
        token::mint = mint,
        token::authority = season,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(season_id: u32)]
pub struct Claim<'info> {
    #[account(seeds = [RewardsState::SEED], bump = rewards.bump)]
    pub rewards: Account<'info, RewardsState>,

    #[account(
        mut,
        seeds = [Season::SEED, &season_id.to_le_bytes()],
        bump = season.bump,
    )]
    pub season: Account<'info, Season>,

    /// Whoever sends the transaction and pays for the nullifier account. Need not be the
    /// beneficiary, which is what makes sponsored claims possible.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: the entitled wallet. Not a signer, and only used as a leaf field and a seed;
    /// the leaf is what authorizes payment, not a signature.
    pub wallet: UncheckedAccount<'info>,

    /// The nullifier. `init` fails if this wallet already claimed this season.
    #[account(
        init,
        payer = payer,
        seeds = [Claimed::SEED, &season_id.to_le_bytes(), wallet.key().as_ref()],
        bump,
        space = Claimed::SPACE,
    )]
    pub claimed: Account<'info, Claimed>,

    #[account(
        mut,
        seeds = [Season::VAULT_SEED, &season_id.to_le_bytes()],
        bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    /// Where the tokens go. Constrained to the entitled wallet, so a sponsor cannot deliver
    /// the reward to themselves, and to the season's mint, so it cannot be delivered as a
    /// different token.
    #[account(
        mut,
        constraint = wallet_token.owner == wallet.key() @ ErrorCode::WrongTokenOwner,
        constraint = wallet_token.mint == season.mint @ ErrorCode::WrongTokenOwner,
    )]
    pub wallet_token: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(season_id: u32)]
pub struct SweepUnclaimed<'info> {
    #[account(
        seeds = [RewardsState::SEED],
        bump = rewards.bump,
        has_one = admin @ ErrorCode::Unauthorized,
    )]
    pub rewards: Account<'info, RewardsState>,

    pub admin: Signer<'info>,

    #[account(
        seeds = [Season::SEED, &season_id.to_le_bytes()],
        bump = season.bump,
    )]
    pub season: Account<'info, Season>,

    #[account(
        mut,
        seeds = [Season::VAULT_SEED, &season_id.to_le_bytes()],
        bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(mut, constraint = destination.mint == season.mint @ ErrorCode::WrongTokenOwner)]
    pub destination: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct AdminOnly<'info> {
    #[account(
        mut,
        seeds = [RewardsState::SEED],
        bump = rewards.bump,
        has_one = admin @ ErrorCode::Unauthorized,
    )]
    pub rewards: Account<'info, RewardsState>,

    pub admin: Signer<'info>,
}
