use anchor_lang::prelude::*;

use crate::{
    errors::ErrorCode,
    state::{GlobalState, MarriageProposal, PetAccount},
    util::core_asset_owner,
};

/// Mirrors EVM `PetCoreV1.proposeMarriage` (plan §4.4): `owner` proposes a mutual
/// marriage between `pet_a` (which they own) and `pet_b` (owned by someone else).
/// Overwrites any expired proposal from `pet_a`; a live (unexpired) proposal blocks a
/// new one.
pub fn handler(ctx: Context<ProposeMarriage>) -> Result<()> {
    require!(!ctx.accounts.global_state.paused, ErrorCode::Paused);

    let pet_a = &ctx.accounts.pet_a;
    let pet_b = &ctx.accounts.pet_b;

    require!(pet_a.id != pet_b.id, ErrorCode::CannotMarrySelf);
    // Current ownership comes from the Core asset, not the informational `pet.owner`
    // field (plan §2.3/v2.1 Phase A). `pet_a`'s ownership by `owner` is enforced by its
    // account constraint below.
    let pet_b_current_owner = core_asset_owner(&ctx.accounts.pet_b_asset.to_account_info())?;
    require!(
        ctx.accounts.owner.key() != pet_b_current_owner,
        ErrorCode::CannotMarrySameOwner
    );

    let now = Clock::get()?.unix_timestamp;
    require!(pet_a.can_marry(now), ErrorCode::PetNotEligibleForMarriage);
    require!(pet_b.can_marry(now), ErrorCode::PetNotEligibleForMarriage);

    // One-level incest guard, mirrors EVM `proposeMarriage`'s parent/child check.
    require!(
        pet_a.parent1_id != pet_b.id
            && pet_a.parent2_id != pet_b.id
            && pet_b.parent1_id != pet_a.id
            && pet_b.parent2_id != pet_a.id,
        ErrorCode::IncestMarriageRejected
    );

    let proposal = &mut ctx.accounts.marriage_proposal;
    if proposal.proposer != Pubkey::default() {
        require!(
            now > proposal.expiry,
            ErrorCode::MarriageProposalAlreadyPending
        );
    }

    let pet_a_id = pet_a.id;
    let pet_b_id = pet_b.id;
    let proposer = ctx.accounts.owner.key();
    let expiry = now.saturating_add(ctx.accounts.global_state.proposal_ttl_seconds);

    proposal.pet_a_id = pet_a_id;
    proposal.pet_b_id = pet_b_id;
    proposal.proposer = proposer;
    proposal.expiry = expiry;
    proposal.bump = ctx.bumps.marriage_proposal;

    emit!(MarriageProposedEvent {
        pet_a_id,
        pet_b_id,
        proposer,
        expiry,
    });

    Ok(())
}

#[event]
pub struct MarriageProposedEvent {
    pub pet_a_id: u32,
    pub pet_b_id: u32,
    pub proposer: Pubkey,
    pub expiry: i64,
}

#[derive(Accounts)]
pub struct ProposeMarriage<'info> {
    #[account(seeds = [GlobalState::SEED], bump = global_state.bump)]
    pub global_state: Account<'info, GlobalState>,

    #[account(mut)]
    pub owner: Signer<'info>,

    /// CHECK: `pet_a`'s Metaplex Core asset account; PDA seed for `pet_a` and source of
    /// truth for ownership (plan §2.3/v2.1 Phase A).
    #[account(owner = mpl_core::ID)]
    pub pet_a_asset: UncheckedAccount<'info>,

    #[account(
        seeds = [PetAccount::SEED, pet_a_asset.key().as_ref()],
        bump = pet_a.bump,
        constraint = core_asset_owner(&pet_a_asset.to_account_info())? == owner.key() @ ErrorCode::Unauthorized,
    )]
    pub pet_a: Account<'info, PetAccount>,

    /// CHECK: `pet_b`'s Metaplex Core asset account; PDA seed for `pet_b` (plan §2.3/v2.1
    /// Phase A re-seed).
    #[account(owner = mpl_core::ID)]
    pub pet_b_asset: UncheckedAccount<'info>,

    #[account(
        seeds = [PetAccount::SEED, pet_b_asset.key().as_ref()],
        bump = pet_b.bump,
    )]
    pub pet_b: Account<'info, PetAccount>,

    #[account(
        init_if_needed,
        payer = owner,
        seeds = [MarriageProposal::SEED, &pet_a.id.to_le_bytes()],
        bump,
        space = MarriageProposal::SPACE,
    )]
    pub marriage_proposal: Account<'info, MarriageProposal>,

    pub system_program: Program<'info, System>,
}
