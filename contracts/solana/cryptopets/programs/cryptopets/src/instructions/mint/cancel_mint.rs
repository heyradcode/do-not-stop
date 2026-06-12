use anchor_lang::prelude::*;

use crate::{
    errors::ErrorCode,
    state::{GlobalState, MintRequest},
};

/// Permissionless cleanup (plan §4.3, mirrors `cancel_battle`/`cancel_breed`): once the
/// committed Switchboard randomness has gone unrevealed for
/// `global_state.randomness_expiry_slots`, anyone may close the stuck `MintRequest` and
/// refund its rent to the owner who paid for it. The mint fee charged at `commit_mint` is
/// not refunded, mirroring `cancel_breed`'s treatment of the (non-stud) breed fee.
pub fn handler(ctx: Context<CancelMint>) -> Result<()> {
    let clock = Clock::get()?;
    let expiry_slot = ctx
        .accounts
        .mint_request
        .commit_slot
        .checked_add(ctx.accounts.global_state.randomness_expiry_slots)
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    require!(clock.slot > expiry_slot, ErrorCode::RandomnessNotExpired);

    emit!(MintCancelledEvent {
        owner: ctx.accounts.mint_request.owner,
        pet_id: ctx.accounts.mint_request.pet_id,
    });

    Ok(())
}

#[event]
pub struct MintCancelledEvent {
    pub owner: Pubkey,
    pub pet_id: u32,
}

#[derive(Accounts)]
pub struct CancelMint<'info> {
    #[account(seeds = [GlobalState::SEED], bump = global_state.bump)]
    pub global_state: Account<'info, GlobalState>,

    /// CHECK: rent refund destination for the closed `mint_request`; tied to it via PDA seeds.
    #[account(mut)]
    pub owner: UncheckedAccount<'info>,

    #[account(
        mut,
        close = owner,
        seeds = [MintRequest::SEED, owner.key().as_ref()],
        bump = mint_request.bump,
        constraint = mint_request.owner == owner.key() @ ErrorCode::Unauthorized,
    )]
    pub mint_request: Account<'info, MintRequest>,
}
