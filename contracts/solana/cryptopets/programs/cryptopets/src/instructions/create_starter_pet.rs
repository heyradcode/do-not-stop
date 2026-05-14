use anchor_lang::prelude::*;

use crate::{errors::ErrorCode, state::GlobalState, state::PetAccount, state::PlayerProfile};

pub fn handler(ctx: Context<CreateStarterPet>, name: String, dna: u64, rarity: u8) -> Result<()> {
    require!(
        name.len() <= PetAccount::MAX_NAME_LEN,
        ErrorCode::NameTooLong
    );

    let global_state = &mut ctx.accounts.global_state;
    let player_profile = &mut ctx.accounts.player_profile;
    let pet = &mut ctx.accounts.pet;

    // enforce pause
    require!(!global_state.paused, ErrorCode::Paused);

    require!(
        !player_profile.starter_created,
        ErrorCode::StarterAlreadyCreated
    );

    player_profile.owner = ctx.accounts.owner.key();
    player_profile.starter_created = true;
    player_profile.pet_count = player_profile.pet_count.checked_add(1).unwrap();
    player_profile.bump = ctx.bumps.player_profile;

    let pet_id = global_state.next_pet_id;
    global_state.next_pet_id = global_state.next_pet_id.checked_add(1).unwrap();

    pet.id = pet_id;
    pet.owner = ctx.accounts.owner.key();
    pet.dna = dna;
    pet.rarity = rarity;
    pet.level = 1;
    pet.ready_time = Clock::get()?.unix_timestamp;
    pet.win_count = 0;
    pet.loss_count = 0;
    pet.bump = ctx.bumps.pet;
    pet.set_name(&name)?;

    Ok(())
}

#[derive(Accounts)]
pub struct CreateStarterPet<'info> {
    #[account(
        mut,
        seeds = [GlobalState::SEED],
        bump = global_state.bump,
    )]
    pub global_state: Account<'info, GlobalState>,
    #[account(
        init_if_needed,
        payer = owner,
        seeds = [PlayerProfile::SEED, owner.key().as_ref()],
        bump,
        space = PlayerProfile::SPACE,
    )]
    pub player_profile: Account<'info, PlayerProfile>,
    #[account(
        init,
        payer = owner,
        seeds = [PetAccount::SEED, owner.key().as_ref(), &global_state.next_pet_id.to_le_bytes()],
        bump,
        space = PetAccount::SPACE,
    )]
    pub pet: Account<'info, PetAccount>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}
