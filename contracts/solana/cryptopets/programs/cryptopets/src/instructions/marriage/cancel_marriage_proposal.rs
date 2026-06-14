use anchor_lang::prelude::*;

use crate::{
    errors::ErrorCode,
    state::{GlobalState, MarriageProposal},
};

/// Mirrors EVM `PetCoreV1.cancelProposal` (plan §4.4): the proposer withdraws a pending
/// proposal from `pet_a_id` at any time (live or expired), closing the `MarriageProposal`
/// account and refunding its rent.
pub fn handler(ctx: Context<CancelMarriageProposal>, _pet_a_id: u32) -> Result<()> {
    require!(!ctx.accounts.global_state.paused, ErrorCode::Paused);

    emit!(MarriageProposalCancelledEvent {
        pet_a_id: ctx.accounts.marriage_proposal.pet_a_id,
        pet_b_id: ctx.accounts.marriage_proposal.pet_b_id,
    });

    Ok(())
}

#[event]
pub struct MarriageProposalCancelledEvent {
    pub pet_a_id: u32,
    pub pet_b_id: u32,
}

#[derive(Accounts)]
#[instruction(pet_a_id: u32)]
pub struct CancelMarriageProposal<'info> {
    #[account(seeds = [GlobalState::SEED], bump = global_state.bump)]
    pub global_state: Account<'info, GlobalState>,

    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        close = owner,
        seeds = [MarriageProposal::SEED, &pet_a_id.to_le_bytes()],
        bump = marriage_proposal.bump,
        constraint = marriage_proposal.proposer == owner.key() @ ErrorCode::NotMarriageProposer,
    )]
    pub marriage_proposal: Account<'info, MarriageProposal>,
}
