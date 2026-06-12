use anchor_lang::prelude::*;

use crate::{errors::ErrorCode, state::PetAccount};

/// Interim defender-consent fix (§3.5/§6 Solana #3): lets a pet's owner opt their pet
/// out of (or back into) being targeted as a defender in `commit_battle`.
pub fn handler(ctx: Context<SetOpenToChallenges>, value: bool) -> Result<()> {
    let pet = &mut ctx.accounts.pet;
    require_keys_eq!(pet.owner, ctx.accounts.owner.key(), ErrorCode::Unauthorized);

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
    #[account(
        mut,
        seeds = [PetAccount::SEED, owner.key().as_ref(), &pet.id.to_le_bytes()],
        bump = pet.bump,
    )]
    pub pet: Account<'info, PetAccount>,
    pub owner: Signer<'info>,
}
