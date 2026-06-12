use anchor_lang::prelude::*;

use crate::{
    errors::ErrorCode,
    state::{BreedRequest, GlobalState},
};

/// Permissionless cleanup (§6 Solana #2): once the committed Switchboard randomness has
/// gone unrevealed for `global_state.randomness_expiry_slots`, anyone may close the stuck
/// `BreedRequest` and refund its rent to the owner who paid for it. `next_pet_id` was not
/// consumed at commit time, so no rollback is needed.
pub fn handler(ctx: Context<CancelBreed>) -> Result<()> {
    let clock = Clock::get()?;
    let expiry_slot = ctx
        .accounts
        .breed_request
        .commit_slot
        .checked_add(ctx.accounts.global_state.randomness_expiry_slots)
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    require!(clock.slot > expiry_slot, ErrorCode::RandomnessNotExpired);

    emit!(BreedCancelledEvent {
        owner: ctx.accounts.breed_request.owner,
        parent1_id: ctx.accounts.breed_request.parent1_id,
        parent2_id: ctx.accounts.breed_request.parent2_id,
        child_id: ctx.accounts.breed_request.child_id,
    });

    Ok(())
}

#[event]
pub struct BreedCancelledEvent {
    pub owner: Pubkey,
    pub parent1_id: u32,
    pub parent2_id: u32,
    pub child_id: u32,
}

#[derive(Accounts)]
pub struct CancelBreed<'info> {
    #[account(seeds = [GlobalState::SEED], bump = global_state.bump)]
    pub global_state: Account<'info, GlobalState>,

    /// CHECK: rent refund destination for the closed `breed_request`; tied to it via PDA seeds.
    #[account(mut)]
    pub owner: UncheckedAccount<'info>,

    #[account(
        mut,
        close = owner,
        seeds = [BreedRequest::SEED, owner.key().as_ref()],
        bump = breed_request.bump,
        constraint = breed_request.owner == owner.key() @ ErrorCode::Unauthorized,
    )]
    pub breed_request: Account<'info, BreedRequest>,
}
