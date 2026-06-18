use anchor_lang::prelude::*;

use crate::{
    errors::ErrorCode,
    state::{GlobalState, MarriageProposal, PetAccount},
    utils::metadata::core_asset_owner,
};

/// Mirrors EVM `PetCoreV1.acceptMarriage` (plan §4.4): `owner` (pet_b's owner) accepts a
/// matching, unexpired proposal from `pet_a`. Re-checks that the stored proposer still
/// owns `pet_a` (propose-then-sell guard), writes mutual marriage records on both pets,
/// and closes the `MarriageProposal` account.
pub fn handler(ctx: Context<AcceptMarriage>) -> Result<()> {
    require!(!ctx.accounts.global_state.paused, ErrorCode::Paused);

    let now = Clock::get()?.unix_timestamp;
    let proposal = &ctx.accounts.marriage_proposal;

    require!(
        proposal.pet_b_id == ctx.accounts.pet_b.id,
        ErrorCode::MarriageProposalNotFound
    );
    require!(proposal.is_live(now), ErrorCode::MarriageProposalExpired);
    // `pet_a_owner` is already validated (account constraint) to equal
    // `core_asset_owner(pet_a_asset)`, so comparing it against `proposal.proposer` is the
    // live propose-then-sell check (plan §2.3/v2.1 Phase A: `pet.owner` no longer tracks
    // post-mint transfers).
    require_keys_eq!(
        ctx.accounts.pet_a_owner.key(),
        proposal.proposer,
        ErrorCode::MarriageProposerNoLongerOwnsPet
    );
    require!(
        !ctx.accounts.pet_a.is_married(),
        ErrorCode::PetNotEligibleForMarriage
    );
    require!(
        !ctx.accounts.pet_b.is_married(),
        ErrorCode::PetNotEligibleForMarriage
    );

    let pet_a_id = ctx.accounts.pet_a.id;
    let pet_b_id = ctx.accounts.pet_b.id;
    // Owner snapshots come from the live Core-asset owners (already validated by account
    // constraints), not the informational `pet.owner` field (plan §2.3/v2.1 Phase A).
    let pet_a_owner = ctx.accounts.pet_a_owner.key();
    let pet_b_owner = ctx.accounts.owner.key();

    ctx.accounts.pet_a.set_marriage(pet_b_id, pet_a_owner);
    ctx.accounts.pet_b.set_marriage(pet_a_id, pet_b_owner);

    emit!(MarriageAcceptedEvent { pet_a_id, pet_b_id });

    Ok(())
}

#[event]
pub struct MarriageAcceptedEvent {
    pub pet_a_id: u32,
    pub pet_b_id: u32,
}

#[derive(Accounts)]
pub struct AcceptMarriage<'info> {
    #[account(seeds = [GlobalState::SEED], bump = global_state.bump)]
    pub global_state: Account<'info, GlobalState>,

    #[account(mut)]
    pub owner: Signer<'info>,

    /// CHECK: `pet_a`'s Metaplex Core asset account; PDA seed for `pet_a` (plan §2.3/v2.1
    /// Phase A re-seed).
    #[account(owner = mpl_core::ID)]
    pub pet_a_asset: UncheckedAccount<'info>,

    /// CHECK: `pet_a`'s current owner, validated against `pet_a_asset` and used as the
    /// rent-refund destination when `marriage_proposal` is closed (it was the payer at
    /// `propose_marriage`).
    #[account(
        mut,
        constraint = core_asset_owner(&pet_a_asset.to_account_info())? == pet_a_owner.key() @ ErrorCode::Unauthorized,
    )]
    pub pet_a_owner: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [PetAccount::SEED, pet_a_asset.key().as_ref()],
        bump = pet_a.bump,
    )]
    pub pet_a: Account<'info, PetAccount>,

    /// CHECK: `pet_b`'s Metaplex Core asset account; PDA seed for `pet_b` and source of
    /// truth for ownership (plan §2.3/v2.1 Phase A).
    #[account(owner = mpl_core::ID)]
    pub pet_b_asset: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [PetAccount::SEED, pet_b_asset.key().as_ref()],
        bump = pet_b.bump,
        constraint = core_asset_owner(&pet_b_asset.to_account_info())? == owner.key() @ ErrorCode::Unauthorized,
    )]
    pub pet_b: Account<'info, PetAccount>,

    #[account(
        mut,
        seeds = [MarriageProposal::SEED, &pet_a.id.to_le_bytes()],
        bump = marriage_proposal.bump,
        close = pet_a_owner,
    )]
    pub marriage_proposal: Account<'info, MarriageProposal>,
}
