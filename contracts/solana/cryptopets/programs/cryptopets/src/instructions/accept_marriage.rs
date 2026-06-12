use anchor_lang::prelude::*;

use crate::{
    errors::ErrorCode,
    state::{GlobalState, MarriageProposal, PetAccount},
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
    require_keys_eq!(
        ctx.accounts.pet_a.owner,
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
    let pet_a_owner = ctx.accounts.pet_a.owner;
    let pet_b_owner = ctx.accounts.pet_b.owner;

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

    /// CHECK: `pet_a`'s owner pubkey, used as a PDA seed for `pet_a` and as the
    /// rent-refund destination when `marriage_proposal` is closed (it was the payer at
    /// `propose_marriage`).
    #[account(mut)]
    pub pet_a_owner: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [PetAccount::SEED, pet_a_owner.key().as_ref(), &pet_a.id.to_le_bytes()],
        bump = pet_a.bump,
        constraint = pet_a.owner == pet_a_owner.key() @ ErrorCode::Unauthorized,
    )]
    pub pet_a: Account<'info, PetAccount>,

    #[account(
        mut,
        seeds = [PetAccount::SEED, owner.key().as_ref(), &pet_b.id.to_le_bytes()],
        bump = pet_b.bump,
        constraint = pet_b.owner == owner.key() @ ErrorCode::Unauthorized,
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
