use anchor_lang::prelude::*;

use crate::{errors::ErrorCode, state::GlobalState, state::PetAccount};

pub fn handler(ctx: Context<LevelUp>) -> Result<()> {
    let global_state = &mut ctx.accounts.global_state;
    let pet = &mut ctx.accounts.pet;

    // enforce pause
    require!(!global_state.paused, ErrorCode::Paused);

    require_keys_eq!(
        pet.owner,
        ctx.accounts.owner.key(),
        LevelUpError::Unauthorized
    );

    // transfer lamports to global state (program-owned)
    let fee = global_state.level_up_fee_lamports;
    require!(fee > 0, LevelUpError::InvalidFee);

    let cpi_ctx = CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        anchor_lang::system_program::Transfer {
            from: ctx.accounts.owner.to_account_info(),
            to: ctx.accounts.global_state.to_account_info(),
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
    #[account(
        mut,
        seeds = [
            PetAccount::SEED, owner.key().as_ref(), &pet.id.to_le_bytes()],
        bump = pet.bump,
    )]
    pub pet: Account<'info, PetAccount>,
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(address = system_program::ID)]
    pub system_program: Program<'info, System>,
}
