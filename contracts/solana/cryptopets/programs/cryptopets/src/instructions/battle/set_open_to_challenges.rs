use anchor_lang::prelude::*;

use crate::{errors::ErrorCode, utils::metadata::core_asset_owner, state::PetAccount};

/// Defender consent (§3.5/§6 Solana #3): lets a pet's owner opt their pet out of (or
/// back into) being targeted as a defender.
///
/// The on-chain battle path that enforced this flag is retired (§L Phase 6), so the
/// program itself no longer reads it. The flag stays as the owner's stated preference,
/// published on the pet account for the backend matchmaker to honour.
pub fn handler(ctx: Context<SetOpenToChallenges>, value: bool) -> Result<()> {
    require_keys_eq!(
        core_asset_owner(&ctx.accounts.pet_asset.to_account_info())?,
        ctx.accounts.owner.key(),
        ErrorCode::Unauthorized
    );

    let pet = &mut ctx.accounts.pet;
    pet.open_to_challenges = value;

    emit!(OpenToChallengesUpdated {
        pet_id: pet.id,
        owner: ctx.accounts.owner.key(),
        value,
    });

    Ok(())
}

#[event]
pub struct OpenToChallengesUpdated {
    pub pet_id: u32,
    pub owner: Pubkey,
    pub value: bool,
}

#[derive(Accounts)]
pub struct SetOpenToChallenges<'info> {
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
    pub owner: Signer<'info>,
}
