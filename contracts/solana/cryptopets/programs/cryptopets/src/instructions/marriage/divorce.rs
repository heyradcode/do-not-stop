use anchor_lang::prelude::*;

use crate::{
    errors::ErrorCode,
    state::{GlobalState, PetAccount},
    metadata::core_asset_owner,
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

    /// CHECK: `pet`'s Metaplex Core asset account; PDA seed for `pet` and source of truth
    /// for ownership (plan §2.3/v2.1 Phase A).
    #[account(owner = mpl_core::ID)]
    pub pet_asset: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [PetAccount::SEED, pet_asset.key().as_ref()],
        bump = pet.bump,
        constraint = core_asset_owner(&pet_asset.to_account_info())? == owner.key() @ ErrorCode::Unauthorized,
    )]
    pub pet: Account<'info, PetAccount>,

    /// CHECK: spouse pet's Metaplex Core asset account; PDA seed for `spouse` (plan
    /// §2.3/v2.1 Phase A re-seed).
    #[account(owner = mpl_core::ID)]
    pub spouse_asset: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [PetAccount::SEED, spouse_asset.key().as_ref()],
        bump = spouse.bump,
    )]
    pub spouse: Account<'info, PetAccount>,
}
