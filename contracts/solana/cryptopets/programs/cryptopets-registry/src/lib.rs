//! Immutable publication record for batches of backend-resolved battle receipts
//! (docs/battle-protocol.md §I), and the Solana counterpart to
//! `contracts/ethereum/src/BattleBatchRegistry.sol`.
//!
//! Deliberately minimal: this program stores roots and nothing else. It does not verify
//! proofs, hold funds, or know what a reward is. The claim path is a separate program, so
//! the thing every player's history is anchored against stays small enough to audit in one
//! sitting.
//!
//! **What anchoring does and does not prove.** Publishing a root here makes the batch
//! immutable and ordered: once written, the operator cannot change what a batch contained
//! or insert one after the fact. It does *not* prove the receipts inside were computed
//! honestly, which is public replay's job (§H), and it does not force the operator to
//! include any particular receipt. A signed receipt that never appears in a batch is
//! evidence of operator failure, not a claim this program can settle.
//!
//! **Its upgrade authority is burned after deploy** (`solana program set-upgrade-authority
//! --final`). That is the Solana equivalent of the Solidity version not being behind a
//! proxy, and it is the whole point: an upgradeable registry would let the operator rewrite
//! history by upgrading the thing that records it. Two consequences follow, and both are
//! intended. Migration means deploying a fresh registry and starting a new chain of
//! batches, which everyone can see. And `set_admin` is the only recovery path left for a
//! compromised key, since no patch can ever be shipped.
//!
//! There are no view instructions. `get_batch` and `is_published_root` are account reads on
//! Solana: the backend and any third-party verifier deserialize the `Batch` PDA directly.
//! Do not add read-only instructions out of Solidity habit; they would be dead code that
//! can never be removed.

pub mod errors;
pub mod state;

use anchor_lang::prelude::*;

use errors::ErrorCode;
use state::{Batch, Publisher, RegistryState, ZERO_ROOT};

// PLACEHOLDER. Anchor's default scaffold id, kept so the crate compiles before a keypair
// exists. Run `anchor keys sync` after the first `anchor build` and before any deploy, or
// this program deploys at an address nothing else agrees on.
declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod cryptopets_registry {
    use super::*;

    /// Creates the registry head. The signer becomes the admin.
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let registry = &mut ctx.accounts.registry;
        registry.admin = ctx.accounts.admin.key();
        registry.latest_batch_number = 0;
        registry.latest_root = ZERO_ROOT;
        registry.latest_last_sequence = 0;
        registry.paused = false;
        registry.bump = ctx.bumps.registry;
        registry._reserved = [0u8; 64];
        Ok(())
    }

    /// Publishes the next batch.
    ///
    /// Every argument is checked against on-chain state rather than trusted, because the
    /// ordering guarantee is the only thing this program actually provides:
    ///
    /// - `batch_number` must be exactly the next one, so a batch cannot be skipped or
    ///   republished. The `init` on the `batch` PDA enforces the same thing a second way:
    ///   an address already holding an account cannot be initialized again.
    /// - `previous_root` must be the current head, so the chain of batches is append-only
    ///   and a fork is impossible rather than merely detectable.
    /// - `first_sequence` must continue from the previous batch's `last_sequence`, so a run
    ///   of receipts cannot be silently dropped between batches. This is the check that
    ///   turns "we published some receipts" into "we published all of them, in order, or
    ///   the transaction failed".
    ///
    /// A gap is still possible *within* the operator's own numbering, since nothing here
    /// can force a receipt to be assigned a sequence at all. That gap is what the inclusion
    /// SLO and its alert exist for, and it is deliberately visible rather than papered over
    /// here.
    pub fn publish_batch(
        ctx: Context<PublishBatch>,
        batch_number: u64,
        previous_root: [u8; 32],
        merkle_root: [u8; 32],
        ruleset_set_hash: [u8; 32],
        first_sequence: u64,
        last_sequence: u64,
    ) -> Result<()> {
        let registry = &mut ctx.accounts.registry;
        require!(!registry.paused, ErrorCode::Paused);

        let expected_number = registry
            .latest_batch_number
            .checked_add(1)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
        require!(batch_number == expected_number, ErrorCode::WrongBatchNumber);
        require!(
            previous_root == registry.latest_root,
            ErrorCode::WrongPreviousRoot
        );
        require!(merkle_root != ZERO_ROOT, ErrorCode::EmptyRoot);
        require!(last_sequence >= first_sequence, ErrorCode::BadSequenceRange);

        // Skipped for the first batch only: before it there is no previous `last_sequence`
        // to continue from, so the operator's starting sequence is whatever it is.
        if registry.latest_batch_number != 0 {
            let expected_first = registry
                .latest_last_sequence
                .checked_add(1)
                .ok_or(ErrorCode::ArithmeticOverflow)?;
            require!(
                first_sequence == expected_first,
                ErrorCode::SequenceNotContiguous
            );
        }

        let published_at = Clock::get()?.unix_timestamp;

        let batch = &mut ctx.accounts.batch;
        batch.previous_root = previous_root;
        batch.merkle_root = merkle_root;
        batch.ruleset_set_hash = ruleset_set_hash;
        batch.first_sequence = first_sequence;
        batch.last_sequence = last_sequence;
        batch.published_at = published_at;
        batch.bump = ctx.bumps.batch;

        registry.latest_batch_number = batch_number;
        registry.latest_root = merkle_root;
        registry.latest_last_sequence = last_sequence;

        emit!(BatchPublished {
            batch_number,
            merkle_root,
            previous_root,
            ruleset_set_hash,
            first_sequence,
            last_sequence,
            published_at,
        });

        Ok(())
    }

    /// Grants publishing rights by creating the publisher's PDA.
    ///
    /// Admin-only, and the admin is expected to be a multisig: rotating a compromised
    /// publisher must not require touching anything else.
    pub fn authorize_publisher(ctx: Context<AuthorizePublisher>) -> Result<()> {
        let record = &mut ctx.accounts.publisher_record;
        record.publisher = ctx.accounts.publisher.key();
        record.bump = ctx.bumps.publisher_record;
        emit!(PublisherSet {
            publisher: record.publisher,
            allowed: true,
        });
        Ok(())
    }

    /// Revokes publishing rights by closing the PDA, refunding its rent to the admin.
    pub fn revoke_publisher(ctx: Context<RevokePublisher>) -> Result<()> {
        emit!(PublisherSet {
            publisher: ctx.accounts.publisher_record.publisher,
            allowed: false,
        });
        Ok(())
    }

    /// Emergency stop. Publication resumes exactly where it left off.
    ///
    /// Pausing does not invalidate anything already published; it only stops new batches,
    /// which is the correct response to a suspected publisher compromise.
    pub fn pause(ctx: Context<AdminOnly>) -> Result<()> {
        ctx.accounts.registry.paused = true;
        Ok(())
    }

    pub fn unpause(ctx: Context<AdminOnly>) -> Result<()> {
        ctx.accounts.registry.paused = false;
        Ok(())
    }

    /// Hands the admin role to `new_admin`.
    ///
    /// Single-step rather than propose/accept, matching the Solidity `Ownable` this mirrors.
    /// The hazard of a typo'd address is real and permanent here, since no upgrade can undo
    /// it, so callers should verify the key on a second device before sending.
    pub fn set_admin(ctx: Context<AdminOnly>, new_admin: Pubkey) -> Result<()> {
        let registry = &mut ctx.accounts.registry;
        emit!(AdminChanged {
            previous: registry.admin,
            current: new_admin,
        });
        registry.admin = new_admin;
        Ok(())
    }
}

// ─── Events ───────────────────────────────────────────────────────────────────

#[event]
pub struct BatchPublished {
    pub batch_number: u64,
    pub merkle_root: [u8; 32],
    pub previous_root: [u8; 32],
    pub ruleset_set_hash: [u8; 32],
    pub first_sequence: u64,
    pub last_sequence: u64,
    pub published_at: i64,
}

#[event]
pub struct PublisherSet {
    pub publisher: Pubkey,
    pub allowed: bool,
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
        seeds = [RegistryState::SEED],
        bump,
        space = RegistryState::SPACE,
    )]
    pub registry: Account<'info, RegistryState>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(batch_number: u64)]
pub struct PublishBatch<'info> {
    #[account(mut, seeds = [RegistryState::SEED], bump = registry.bump)]
    pub registry: Account<'info, RegistryState>,

    #[account(mut)]
    pub publisher: Signer<'info>,

    /// The signer's authorization. This account existing *is* the permission, so a revoked
    /// publisher fails to deserialize here and never reaches the handler.
    #[account(
        seeds = [Publisher::SEED, publisher.key().as_ref()],
        bump = publisher_record.bump,
    )]
    pub publisher_record: Account<'info, Publisher>,

    /// `init` rather than `init_if_needed`: republishing a batch number must be impossible,
    /// not merely refused by a check that could later be relaxed.
    #[account(
        init,
        payer = publisher,
        seeds = [Batch::SEED, &batch_number.to_le_bytes()],
        bump,
        space = Batch::SPACE,
    )]
    pub batch: Account<'info, Batch>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AuthorizePublisher<'info> {
    #[account(
        seeds = [RegistryState::SEED],
        bump = registry.bump,
        has_one = admin @ ErrorCode::Unauthorized,
    )]
    pub registry: Account<'info, RegistryState>,

    #[account(mut)]
    pub admin: Signer<'info>,

    /// CHECK: the wallet being authorized. Any pubkey is valid; it is only used as a seed.
    pub publisher: UncheckedAccount<'info>,

    #[account(
        init,
        payer = admin,
        seeds = [Publisher::SEED, publisher.key().as_ref()],
        bump,
        space = Publisher::SPACE,
    )]
    pub publisher_record: Account<'info, Publisher>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevokePublisher<'info> {
    #[account(
        seeds = [RegistryState::SEED],
        bump = registry.bump,
        has_one = admin @ ErrorCode::Unauthorized,
    )]
    pub registry: Account<'info, RegistryState>,

    #[account(mut)]
    pub admin: Signer<'info>,

    /// CHECK: the wallet being revoked. Only used as a seed.
    pub publisher: UncheckedAccount<'info>,

    #[account(
        mut,
        close = admin,
        seeds = [Publisher::SEED, publisher.key().as_ref()],
        bump = publisher_record.bump,
    )]
    pub publisher_record: Account<'info, Publisher>,
}

#[derive(Accounts)]
pub struct AdminOnly<'info> {
    #[account(
        mut,
        seeds = [RegistryState::SEED],
        bump = registry.bump,
        has_one = admin @ ErrorCode::Unauthorized,
    )]
    pub registry: Account<'info, RegistryState>,

    pub admin: Signer<'info>,
}
