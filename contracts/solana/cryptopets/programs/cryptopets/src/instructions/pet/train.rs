use anchor_lang::prelude::*;

use crate::{
    errors::ErrorCode,
    state::{train_fee_for, GlobalState, PetAccount, FEE_VAULT_SEED},
    metadata::core_asset_owner,
};

/// Pay a level-scaled fee for a flat XP grant, once per train cooldown (plan §3.4,
/// mirrors EVM `GameLogicV1.train`).
pub fn handler(ctx: Context<Train>) -> Result<()> {
    let global_state = &ctx.accounts.global_state;
    require!(!global_state.paused, ErrorCode::Paused);

    require_keys_eq!(
        core_asset_owner(&ctx.accounts.pet_asset.to_account_info())?,
        ctx.accounts.owner.key(),
        ErrorCode::Unauthorized
    );

    let pet = &ctx.accounts.pet;

    let now = Clock::get()?.unix_timestamp;
    require!(pet.is_train_ready(now), ErrorCode::PetNotTrainReady);

    let fee = train_fee_for(pet.level, global_state.train_fee_lamports)?;
    let cooldown_seconds = global_state.train_cooldown_seconds;
    let xp_gained = global_state.train_xp;
    let max_level = global_state.max_level;

    let cpi_ctx = CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        anchor_lang::system_program::Transfer {
            from: ctx.accounts.owner.to_account_info(),
            to: ctx.accounts.fee_vault.to_account_info(),
        },
    );
    anchor_lang::system_program::transfer(cpi_ctx, fee)?;

    let pet = &mut ctx.accounts.pet;
    pet.trigger_train_cooldown(now, cooldown_seconds);
    pet.add_xp(xp_gained, max_level)?;

    emit!(TrainedEvent {
        pet_id: pet.id,
        xp_gained,
        new_xp: pet.xp,
        new_level: pet.level,
    });

    Ok(())
}

#[event]
pub struct TrainedEvent {
    pub pet_id: u32,
    pub xp_gained: u32,
    pub new_xp: u32,
    pub new_level: u16,
}

#[derive(Accounts)]
pub struct Train<'info> {
    #[account(seeds = [GlobalState::SEED], bump = global_state.bump)]
    pub global_state: Account<'info, GlobalState>,

    /// CHECK: this pet's Metaplex Core asset account; PDA seed for `pet` and source of
    /// truth for ownership (plan §2.3/v2.1 Phase A).
    #[account(owner = mpl_core::ID)]
    pub pet_asset: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [PetAccount::SEED, pet_asset.key().as_ref()],
        bump = pet.bump,
    )]
    pub pet: Account<'info, PetAccount>,

    #[account(mut, seeds = [FEE_VAULT_SEED], bump)]
    pub fee_vault: SystemAccount<'info>,

    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(address = system_program::ID)]
    pub system_program: Program<'info, System>,
}
