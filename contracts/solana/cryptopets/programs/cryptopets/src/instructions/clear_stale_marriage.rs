use anchor_lang::prelude::*;

use crate::{errors::ErrorCode, state::PetAccount};

/// Permissionless cleanup, mirrors EVM `PetCoreV1.clearStaleMarriage` (plan §4.4): either
/// pet's owner has changed since the marriage was accepted, invalidating consent. No
/// marriage cooldown is applied (unlike `divorce`).
pub fn handler(ctx: Context<ClearStaleMarriage>) -> Result<()> {
    let pet_a = &ctx.accounts.pet_a;
    let pet_b = &ctx.accounts.pet_b;

    require!(pet_a.spouse_id == pet_b.id, ErrorCode::NotMarriedToEachOther);

    let stale = pet_a.marriage_owner_snapshot != pet_a.owner
        || pet_b.marriage_owner_snapshot != pet_b.owner;
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
    /// CHECK: pet_a's owner pubkey, used as a PDA seed for `pet_a`.
    pub pet_a_owner: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [PetAccount::SEED, pet_a_owner.key().as_ref(), &pet_a.id.to_le_bytes()],
        bump = pet_a.bump,
        constraint = pet_a.owner == pet_a_owner.key() @ ErrorCode::Unauthorized,
    )]
    pub pet_a: Account<'info, PetAccount>,

    /// CHECK: pet_b's owner pubkey, used as a PDA seed for `pet_b`.
    pub pet_b_owner: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [PetAccount::SEED, pet_b_owner.key().as_ref(), &pet_b.id.to_le_bytes()],
        bump = pet_b.bump,
        constraint = pet_b.owner == pet_b_owner.key() @ ErrorCode::Unauthorized,
    )]
    pub pet_b: Account<'info, PetAccount>,
}
