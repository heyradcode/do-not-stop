use anchor_lang::prelude::*;

use crate::{
    errors::ErrorCode,
    state::{GlobalState, PetAccount},
};

/// Mirrors EVM `PetCoreV1.divorce` (plan §4.4): `owner` (pet's owner) dissolves the
/// marriage between `pet` and its spouse. Both pets enter `marriage_cooldown_seconds`
/// before either may marry again, preventing propose/divorce spam.
pub fn handler(ctx: Context<Divorce>) -> Result<()> {
    require!(!ctx.accounts.global_state.paused, ErrorCode::Paused);

    require!(ctx.accounts.pet.is_married(), ErrorCode::NotMarried);
    require!(
        ctx.accounts.spouse.spouse_id == ctx.accounts.pet.id,
        ErrorCode::NotMarriedToEachOther
    );

    let now = Clock::get()?.unix_timestamp;
    let cooldown_until = now.saturating_add(ctx.accounts.global_state.marriage_cooldown_seconds);

    let pet_id = ctx.accounts.pet.id;
    let spouse_id = ctx.accounts.pet.spouse_id;

    ctx.accounts.pet.clear_marriage(cooldown_until);
    ctx.accounts.spouse.clear_marriage(cooldown_until);

    emit!(MarriageDivorcedEvent {
        pet_id,
        spouse_id,
        cooldown_until,
    });

    Ok(())
}

#[event]
pub struct MarriageDivorcedEvent {
    pub pet_id: u32,
    pub spouse_id: u32,
    pub cooldown_until: i64,
}

#[derive(Accounts)]
pub struct Divorce<'info> {
    #[account(seeds = [GlobalState::SEED], bump = global_state.bump)]
    pub global_state: Account<'info, GlobalState>,

    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [PetAccount::SEED, owner.key().as_ref(), &pet.id.to_le_bytes()],
        bump = pet.bump,
        constraint = pet.owner == owner.key() @ ErrorCode::Unauthorized,
    )]
    pub pet: Account<'info, PetAccount>,

    /// CHECK: spouse pet's owner pubkey, used as a PDA seed for `spouse`.
    pub spouse_owner: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [PetAccount::SEED, spouse_owner.key().as_ref(), &pet.spouse_id.to_le_bytes()],
        bump = spouse.bump,
        constraint = spouse.owner == spouse_owner.key() @ ErrorCode::Unauthorized,
    )]
    pub spouse: Account<'info, PetAccount>,
}
