use crate::{errors::ErrorCode, state::GlobalState, state::PetAccount};
use anchor_lang::prelude::*;

pub fn handler(ctx: Context<RenamePet>, name: String) -> Result<()> {
    require!(
        name.len() <= PetAccount::MAX_NAME_LEN,
        ErrorCode::NameTooLong
    );

    let pet = &mut ctx.accounts.pet;

    require_keys_eq!(pet.owner, ctx.accounts.owner.key(), ErrorCode::Unauthorized);

    pet.set_name(&name)?;

    Ok(())
}

#[derive(Accounts)]
pub struct RenamePet<'info> {
    #[account(
        seeds = [GlobalState::SEED],
        bump = global_state.bump,
    )]
    pub global_state: Account<'info, GlobalState>,
    #[account(
        mut,
        seeds = [PetAccount::SEED, owner.key().as_ref(), &pet.id.to_le_bytes()],
        bump = pet.bump,
    )]
    pub pet: Account<'info, PetAccount>,
    #[account(mut)]
    pub owner: Signer<'info>,
}
