use crate::{errors::ErrorCode, state::GlobalState, state::PetAccount, util::core_asset_owner};
use anchor_lang::prelude::*;

pub fn handler(ctx: Context<RenamePet>, name: String) -> Result<()> {
    require!(
        name.len() <= PetAccount::MAX_NAME_LEN,
        ErrorCode::NameTooLong
    );

    require_keys_eq!(
        core_asset_owner(&ctx.accounts.pet_asset.to_account_info())?,
        ctx.accounts.owner.key(),
        ErrorCode::Unauthorized
    );

    let pet = &mut ctx.accounts.pet;
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
    #[account(mut)]
    pub owner: Signer<'info>,
}
