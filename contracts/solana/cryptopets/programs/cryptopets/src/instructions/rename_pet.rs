use anchor_lang::prelude::*;

use crate::{errors::ErrorCode, state::PetAccount};

pub fn handler(ctx: Context<crate::RenamePet>, name: String) -> Result<()> {
    require!(name.len() <= PetAccount::MAX_NAME_LEN, ErrorCode::NameTooLong);

    let pet = &mut ctx.accounts.pet;

    require_keys_eq!(pet.owner, ctx.accounts.owner.key(), ErrorCode::Unauthorized);

    pet.set_name(&name)?;

    Ok(())
}

#[derive(Accounts)]
pub struct RenamePet<'info> {
    #[account(
        seeds = [state::GlobalState::SEED],
        bump = global_state.bump,
    )]
    pub global_state: Account<'info, state::GlobalState>,
    #[account(
        mut,
        seeds = [state::PetAccount::SEED, owner.key().as_ref(), &pet.id.to_le_bytes()],
        bump = pet.bump,
    )]
    pub pet: Account<'info, state::PetAccount>,
    #[account(mut)]
    pub owner: Signer<'info>,
}
