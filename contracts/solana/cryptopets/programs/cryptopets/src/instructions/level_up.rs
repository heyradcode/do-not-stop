use anchor_lang::prelude::*;

use crate::{
    errors::ErrorCode,
    state::GlobalState,
    state::PetAccount,
    state::FEE_VAULT_SEED,
    util::core_asset_owner,
};

pub fn handler(ctx: Context<LevelUp>) -> Result<()> {
    let global_state = &mut ctx.accounts.global_state;

    // enforce pause
    require!(!global_state.paused, ErrorCode::Paused);

    require_keys_eq!(
        core_asset_owner(&ctx.accounts.pet_asset.to_account_info())?,
        ctx.accounts.owner.key(),
        LevelUpError::Unauthorized
    );

    let pet = &mut ctx.accounts.pet;

    require!(
        pet.level < global_state.max_level,
        ErrorCode::MaxLevelReached
    );

    // transfer lamports to the fee vault
    let fee = global_state.level_up_fee_lamports;
    require!(fee > 0, LevelUpError::InvalidFee);

    let cpi_ctx = CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        anchor_lang::system_program::Transfer {
            from: ctx.accounts.owner.to_account_info(),
            to: ctx.accounts.fee_vault.to_account_info(),
        },
    );
    anchor_lang::system_program::transfer(cpi_ctx, fee)?;

    pet.level = pet.level.checked_add(1).unwrap();

    Ok(())
}

#[error_code]
pub enum LevelUpError {
    #[msg("Pet fee invalid")]
    InvalidFee,
    #[msg("Not authorized to level this pet")]
    Unauthorized,
}

#[derive(Accounts)]
pub struct LevelUp<'info> {
    #[account(
        mut,
        seeds = [  GlobalState::SEED],
        bump = global_state.bump,
    )]
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
