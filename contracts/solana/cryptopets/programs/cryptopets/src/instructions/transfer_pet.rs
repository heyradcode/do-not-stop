use anchor_lang::prelude::*;

use crate::{errors::ErrorCode, state::GlobalState, state::PetAccount, state::PlayerProfile};

pub fn handler(ctx: Context<TransferPet>) -> Result<()> {
    require!(!ctx.accounts.global_state.paused, ErrorCode::Paused);

    let from_pet = &ctx.accounts.from_pet;
    let pet_id = from_pet.id;
    let dna = from_pet.dna;
    let rarity = from_pet.rarity;
    let level = from_pet.level;
    let ready_time = from_pet.ready_time;
    let win_count = from_pet.win_count;
    let loss_count = from_pet.loss_count;
    let name_len = from_pet.name_len;
    let name = from_pet.name;

    let from_profile = &mut ctx.accounts.from_player_profile;
    from_profile.pet_count = from_profile
        .pet_count
        .checked_sub(1)
        .ok_or(ErrorCode::PetCountUnderflow)?;

    let to_profile = &mut ctx.accounts.to_player_profile;
    if to_profile.owner == Pubkey::default() {
        to_profile.owner = ctx.accounts.to_owner.key();
        to_profile.bump = ctx.bumps.to_player_profile;
        to_profile.starter_created = false;
        to_profile.pet_count = 0;
    }
    to_profile.pet_count = to_profile
        .pet_count
        .checked_add(1)
        .ok_or(ErrorCode::PetCountOverflow)?;

    let to_pet = &mut ctx.accounts.to_pet;
    to_pet.id = pet_id;
    to_pet.owner = ctx.accounts.to_owner.key();
    to_pet.dna = dna;
    to_pet.rarity = rarity;
    to_pet.level = level;
    to_pet.ready_time = ready_time;
    to_pet.win_count = win_count;
    to_pet.loss_count = loss_count;
    to_pet.bump = ctx.bumps.to_pet;
    to_pet.name_len = name_len;
    to_pet.name = name;

    Ok(())
}

#[derive(Accounts)]
pub struct TransferPet<'info> {
    #[account(
        seeds = [GlobalState::SEED],
        bump = global_state.bump,
    )]
    pub global_state: Account<'info, GlobalState>,

    #[account(
        mut,
        seeds = [PlayerProfile::SEED, from_owner.key().as_ref()],
        bump = from_player_profile.bump,
    )]
    pub from_player_profile: Account<'info, PlayerProfile>,

    #[account(
        mut,
        close = from_owner,
        seeds = [PetAccount::SEED, from_owner.key().as_ref(), &from_pet.id.to_le_bytes()],
        bump = from_pet.bump,
        constraint = from_pet.owner == from_owner.key() @ ErrorCode::Unauthorized,
    )]
    pub from_pet: Account<'info, PetAccount>,

    /// CHECK: recipient wallet; seeds on `to_pet` bind ownership.
    #[account(
        constraint = to_owner.key() != from_owner.key() @ ErrorCode::CannotTransferToSelf,
    )]
    pub to_owner: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = from_owner,
        seeds = [PlayerProfile::SEED, to_owner.key().as_ref()],
        bump,
        space = PlayerProfile::SPACE,
    )]
    pub to_player_profile: Account<'info, PlayerProfile>,

    #[account(
        init,
        payer = from_owner,
        seeds = [PetAccount::SEED, to_owner.key().as_ref(), &from_pet.id.to_le_bytes()],
        bump,
        space = PetAccount::SPACE,
    )]
    pub to_pet: Account<'info, PetAccount>,

    #[account(mut)]
    pub from_owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}
