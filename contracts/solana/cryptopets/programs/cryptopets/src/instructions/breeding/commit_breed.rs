use anchor_lang::prelude::*;

use crate::{
    errors::ErrorCode,
    state::{BreedRequest, GlobalState, PetAccount, StudFeeAccount, FEE_VAULT_SEED},
    util::{assert_randomness_committed, core_asset_owner},
};

pub fn handler(
    ctx: Context<CommitBreed>,
    randomness_account: Pubkey,
    name: String,
) -> Result<()> {
    require!(!ctx.accounts.global_state.paused, ErrorCode::Paused);
    require!(
        name.len() <= PetAccount::MAX_NAME_LEN,
        ErrorCode::NameTooLong
    );
    require!(
        ctx.accounts.parent1.key() != ctx.accounts.parent2.key(),
        ErrorCode::CannotBreedSelf
    );

    let now = Clock::get()?.unix_timestamp;

    // Same-owner vs cross-owner breeding (plan §4.4, mirrors EVM `requestCreateFromDNA`).
    // `parent1`'s ownership by `owner` and `parent2`'s ownership by `parent2_owner` are
    // each enforced by the account constraints below (via `core_asset_owner`), so the EVM
    // `owner1 == msg.sender || owner2 == msg.sender` check is automatically satisfied
    // here.
    let cross_owner = ctx.accounts.owner.key() != ctx.accounts.parent2_owner.key();

    let parent1_dna;
    let parent2_dna;
    {
        let p1 = &ctx.accounts.parent1;
        let p2 = &ctx.accounts.parent2;
        require!(p1.is_ready(now), ErrorCode::PetNotReady);
        require!(p2.is_ready(now), ErrorCode::PetNotReady);
        require!(p1.is_breed_ready(now), ErrorCode::PetNotBreedReady);
        require!(p2.is_breed_ready(now), ErrorCode::PetNotBreedReady);
        // One-level incest guard (plan §4.1, mirrors EVM `_validateBreedPair`): neither
        // pet may be a parent of the other.
        require!(
            p1.parent1_id != p2.id
                && p1.parent2_id != p2.id
                && p2.parent1_id != p1.id
                && p2.parent2_id != p1.id,
            ErrorCode::IncestBreedingRejected
        );
        if cross_owner {
            // Cross-owner breeding requires an active marriage (plan §4.4, mirrors EVM
            // `petCore.isMarriageValid`). Owner snapshots are compared against the live
            // Core-asset owners (already validated equal to `owner`/`parent2_owner` by
            // the account constraints below), since `pet.owner` is now informational-only
            // and no longer tracks post-mint transfers.
            require!(
                p1.spouse_id == p2.id
                    && p2.spouse_id == p1.id
                    && p1.marriage_owner_snapshot == ctx.accounts.owner.key()
                    && p2.marriage_owner_snapshot == ctx.accounts.parent2_owner.key(),
                ErrorCode::PetsNotMarried
            );
        }
        parent1_dna = p1.dna;
        parent2_dna = p2.dna;
    }

    let commit_slot = assert_randomness_committed(
        &ctx.accounts.randomness_account_data.to_account_info(),
        randomness_account,
    )?;

    // Breed fee (plan §4.3, mirrors EVM `GameConfig.breedFee` / `requestCreateFromDNA`).
    let breed_fee = ctx.accounts.global_state.breed_fee_lamports;
    let cpi_ctx = CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        anchor_lang::system_program::Transfer {
            from: ctx.accounts.owner.to_account_info(),
            to: ctx.accounts.fee_vault.to_account_info(),
        },
    );
    anchor_lang::system_program::transfer(cpi_ctx, breed_fee)?;

    // Stud fee escrow for cross-owner breeding (plan §4.4, mirrors EVM
    // `requestCreateFromDNA`'s `studFeeAmount`/`otherOwner` branch). The lamports are
    // parked in the recipient's `StudFeeAccount` PDA now, but the withdrawable
    // `amount` is only credited at `settle_breed` (mirrors EVM holding `msg.value`
    // until `settleBreed` credits `pendingStudFees`) — crediting it here would let
    // the recipient withdraw the fee while the breed is still pending, leaving an
    // expired request's `cancel_breed` refund permanently underfunded.
    let (stud_fee, other_owner) = if cross_owner {
        (
            ctx.accounts.global_state.stud_fee_lamports,
            ctx.accounts.parent2_owner.key(),
        )
    } else {
        (0, Pubkey::default())
    };

    ctx.accounts.stud_fee_account.owner = ctx.accounts.parent2_owner.key();
    ctx.accounts.stud_fee_account.bump = ctx.bumps.stud_fee_account;

    if stud_fee > 0 {
        let cpi_ctx = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.owner.to_account_info(),
                to: ctx.accounts.stud_fee_account.to_account_info(),
            },
        );
        anchor_lang::system_program::transfer(cpi_ctx, stud_fee)?;
    }

    let child_id = ctx.accounts.global_state.next_pet_id;

    let breed_request = &mut ctx.accounts.breed_request;
    breed_request.owner = ctx.accounts.owner.key();
    breed_request.parent1_id = ctx.accounts.parent1.id;
    breed_request.parent2_id = ctx.accounts.parent2.id;
    breed_request.child_id = child_id;
    breed_request.randomness_account = randomness_account;
    breed_request.commit_slot = commit_slot;
    breed_request.bump = ctx.bumps.breed_request;
    breed_request.stud_fee = stud_fee;
    breed_request.other_owner = other_owner;
    breed_request.set_name(&name)?;

    let cooldown_seconds = ctx.accounts.global_state.battle_cooldown_seconds;
    ctx.accounts.parent1.trigger_cooldown(now, cooldown_seconds);
    ctx.accounts.parent2.trigger_cooldown(now, cooldown_seconds);

    emit!(BreedCommittedEvent {
        owner: ctx.accounts.owner.key(),
        parent1_id: breed_request.parent1_id,
        parent2_id: breed_request.parent2_id,
        child_id,
        randomness_account,
        parent1_dna,
        parent2_dna,
    });

    Ok(())
}

#[event]
pub struct BreedCommittedEvent {
    pub owner: Pubkey,
    pub parent1_id: u32,
    pub parent2_id: u32,
    pub child_id: u32,
    pub randomness_account: Pubkey,
    pub parent1_dna: u64,
    pub parent2_dna: u64,
}

#[derive(Accounts)]
pub struct CommitBreed<'info> {
    #[account(seeds = [GlobalState::SEED], bump = global_state.bump)]
    pub global_state: Account<'info, GlobalState>,

    #[account(mut)]
    pub owner: Signer<'info>,

    /// CHECK: parent1's Metaplex Core asset account; PDA seed for `parent1` and source of
    /// truth for ownership (plan §2.3/v2.1 Phase A).
    #[account(owner = mpl_core::ID)]
    pub parent1_asset: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [PetAccount::SEED, parent1_asset.key().as_ref()],
        bump = parent1.bump,
        constraint = core_asset_owner(&parent1_asset.to_account_info())? == owner.key() @ ErrorCode::Unauthorized,
    )]
    pub parent1: Account<'info, PetAccount>,

    /// CHECK: parent2's owner pubkey, used as a PDA seed for `stud_fee_account`. Equal to
    /// `owner` for same-owner breeding (plan §4.4).
    pub parent2_owner: UncheckedAccount<'info>,

    /// CHECK: parent2's Metaplex Core asset account; PDA seed for `parent2` and source of
    /// truth for ownership (plan §2.3/v2.1 Phase A).
    #[account(owner = mpl_core::ID)]
    pub parent2_asset: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [PetAccount::SEED, parent2_asset.key().as_ref()],
        bump = parent2.bump,
        constraint = core_asset_owner(&parent2_asset.to_account_info())? == parent2_owner.key() @ ErrorCode::Unauthorized,
    )]
    pub parent2: Account<'info, PetAccount>,

    #[account(
        init,
        payer = owner,
        seeds = [BreedRequest::SEED, owner.key().as_ref()],
        bump,
        space = BreedRequest::SPACE,
    )]
    pub breed_request: Account<'info, BreedRequest>,

    #[account(mut, seeds = [FEE_VAULT_SEED], bump)]
    pub fee_vault: SystemAccount<'info>,

    /// Stud-fee escrow PDA for `parent2_owner` (plan §4.4, mirrors EVM
    /// `pendingStudFees[otherOwner]`). Initialized lazily on first use; for same-owner
    /// breeds this is the caller's own (zero-balance) escrow account.
    #[account(
        init_if_needed,
        payer = owner,
        seeds = [StudFeeAccount::SEED, parent2_owner.key().as_ref()],
        bump,
        space = StudFeeAccount::SPACE,
    )]
    pub stud_fee_account: Account<'info, StudFeeAccount>,

    /// CHECK: parsed as Switchboard `RandomnessAccountData` in the handler.
    pub randomness_account_data: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}
