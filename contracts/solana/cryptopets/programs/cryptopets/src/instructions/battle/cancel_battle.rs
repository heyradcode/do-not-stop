use anchor_lang::prelude::*;

use crate::{
    errors::ErrorCode,
    state::{BattleRequest, GlobalState},
};

/// Permissionless cleanup (§6 Solana #2): once the committed Switchboard randomness has
/// gone unrevealed for `global_state.randomness_expiry_slots`, anyone may close the stuck
/// `BattleRequest` and refund its rent to the attacker who paid for it.
pub fn handler(ctx: Context<CancelBattle>) -> Result<()> {
    let clock = Clock::get()?;
    let expiry_slot = ctx
        .accounts
        .battle_request
        .commit_slot
        .checked_add(ctx.accounts.global_state.randomness_expiry_slots)
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    require!(clock.slot > expiry_slot, ErrorCode::RandomnessNotExpired);

    emit!(BattleCancelledEvent {
        attacker_owner: ctx.accounts.battle_request.attacker_owner,
        defender_owner: ctx.accounts.battle_request.defender_owner,
        attacker_pet_id: ctx.accounts.battle_request.attacker_pet_id,
        defender_pet_id: ctx.accounts.battle_request.defender_pet_id,
    });

    Ok(())
}

#[event]
pub struct BattleCancelledEvent {
    pub attacker_owner: Pubkey,
    pub defender_owner: Pubkey,
    pub attacker_pet_id: u32,
    pub defender_pet_id: u32,
}

#[derive(Accounts)]
pub struct CancelBattle<'info> {
    #[account(seeds = [GlobalState::SEED], bump = global_state.bump)]
    pub global_state: Account<'info, GlobalState>,

    /// CHECK: rent refund destination for the closed `battle_request`; tied to it via PDA seeds.
    #[account(mut)]
    pub attacker_owner: UncheckedAccount<'info>,

    #[account(
        mut,
        close = attacker_owner,
        seeds = [BattleRequest::SEED, attacker_owner.key().as_ref()],
        bump = battle_request.bump,
        constraint = battle_request.attacker_owner == attacker_owner.key() @ ErrorCode::Unauthorized,
    )]
    pub battle_request: Account<'info, BattleRequest>,
}
