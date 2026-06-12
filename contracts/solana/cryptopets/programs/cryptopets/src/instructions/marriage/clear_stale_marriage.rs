use anchor_lang::prelude::*;

use crate::{
    errors::ErrorCode,
    state::PetAccount,
    util::core_asset_owner,
};

/// Permissionless cleanup, mirrors EVM `PetCoreV1.clearStaleMarriage` (plan §4.4): either
/// pet's owner has changed since the marriage was accepted, invalidating consent. No
/// marriage cooldown is applied (unlike `divorce`).
pub fn handler(ctx: Context<ClearStaleMarriage>) -> Result<()> {
    let pet_a = &ctx.accounts.pet_a;
    let pet_b = &ctx.accounts.pet_b;

    require!(pet_a.spouse_id == pet_b.id, ErrorCode::NotMarriedToEachOther);

    // Live Core-asset owners (plan §2.3/v2.1 Phase A) are the source of truth for
    // staleness, compared against the snapshot taken at `accept_marriage` time.
    let stale = pet_a.marriage_owner_snapshot != core_asset_owner(&ctx.accounts.pet_a_asset.to_account_info())?
        || pet_b.marriage_owner_snapshot != core_asset_owner(&ctx.accounts.pet_b_asset.to_account_info())?;
    require!(stale, ErrorCode::MarriageNotStale);

    let pet_a_id = pet_a.id;
    let pet_b_id = pet_b.id;

    ctx.accounts.pet_a.clear_stale_marriage();
    ctx.accounts.pet_b.clear_stale_marriage();

    emit!(MarriageStaleClearedEvent { pet_a_id, pet_b_id });

    Ok(())
}

#[event]
pub struct MarriageStaleClearedEvent {
    pub pet_a_id: u32,
    pub pet_b_id: u32,
}

#[derive(Accounts)]
pub struct ClearStaleMarriage<'info> {
    /// CHECK: pet_a's Metaplex Core asset account; PDA seed for `pet_a` and source of
    /// truth for ownership (plan §2.3/v2.1 Phase A).
    #[account(owner = mpl_core::ID)]
    pub pet_a_asset: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [PetAccount::SEED, pet_a_asset.key().as_ref()],
        bump = pet_a.bump,
    )]
    pub pet_a: Account<'info, PetAccount>,

    /// CHECK: pet_b's Metaplex Core asset account; PDA seed for `pet_b` and source of
    /// truth for ownership (plan §2.3/v2.1 Phase A).
    #[account(owner = mpl_core::ID)]
    pub pet_b_asset: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [PetAccount::SEED, pet_b_asset.key().as_ref()],
        bump = pet_b.bump,
    )]
    pub pet_b: Account<'info, PetAccount>,
}
