use anchor_lang::prelude::*;

use crate::{
    errors::ErrorCode,
    rarity::Rarity,
    state::{GlobalState, PetAccount, PlayerProfile},
    util::pseudo_random,
};

pub fn handler(ctx: Context<Breed>, name: String) -> Result<()> {
    require!(!ctx.accounts.global_state.paused, ErrorCode::Paused);
    require!(
        name.len() <= PetAccount::MAX_NAME_LEN,
        ErrorCode::NameTooLong
    );
    require!(
        ctx.accounts.parent1.key() != ctx.accounts.parent2.key(),
        ErrorCode::CannotBreedSelf
    );

    let now = Clock::get()?.unix_timestamp;
    let slot = Clock::get()?.slot;

    let parent1_dna;
    let parent2_dna;
    {
        let p1 = &ctx.accounts.parent1;
        let p2 = &ctx.accounts.parent2;
        require_keys_eq!(p1.owner, ctx.accounts.owner.key(), ErrorCode::Unauthorized);
        require_keys_eq!(p2.owner, ctx.accounts.owner.key(), ErrorCode::Unauthorized);
        require!(p1.is_ready(now), ErrorCode::PetNotReady);
        require!(p2.is_ready(now), ErrorCode::PetNotReady);
        parent1_dna = p1.dna;
        parent2_dna = p2.dna;
    }

    let new_dna = pseudo_random(&[
        &parent1_dna.to_le_bytes(),
        &parent2_dna.to_le_bytes(),
        &slot.to_le_bytes(),
        &now.to_le_bytes(),
        &ctx.accounts.owner.key().to_bytes(),
    ]);
    let rarity = Rarity::from_dna(new_dna).into();

    let global_state = &mut ctx.accounts.global_state;
    let child_id = global_state.next_pet_id;
    global_state.next_pet_id = global_state
        .next_pet_id
        .checked_add(1)
        .ok_or(ErrorCode::ArithmeticOverflow)?;

    let player_profile = &mut ctx.accounts.player_profile;
    player_profile.pet_count = player_profile
        .pet_count
        .checked_add(1)
        .ok_or(ErrorCode::PetCountOverflow)?;

    let child = &mut ctx.accounts.child;
    child.id = child_id;
    child.owner = ctx.accounts.owner.key();
    child.dna = new_dna;
    child.rarity = rarity;
    child.level = 1;
    child.ready_time = now;
    child.win_count = 0;
    child.loss_count = 0;
    child.bump = ctx.bumps.child;
    child.set_name(&name)?;

    ctx.accounts.parent1.trigger_cooldown(now);
    ctx.accounts.parent2.trigger_cooldown(now);

    emit!(BredEvent {
        parent1_id: ctx.accounts.parent1.id,
        parent2_id: ctx.accounts.parent2.id,
        child_id,
    });

    Ok(())
}

#[event]
pub struct BredEvent {
    pub parent1_id: u32,
    pub parent2_id: u32,
    pub child_id: u32,
}

#[derive(Accounts)]
pub struct Breed<'info> {
    #[account(mut, seeds = [GlobalState::SEED], bump = global_state.bump)]
    pub global_state: Account<'info, GlobalState>,

    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [PlayerProfile::SEED, owner.key().as_ref()],
        bump = player_profile.bump,
    )]
    pub player_profile: Account<'info, PlayerProfile>,

    #[account(
        mut,
        seeds = [PetAccount::SEED, owner.key().as_ref(), &parent1.id.to_le_bytes()],
        bump = parent1.bump,
        constraint = parent1.owner == owner.key() @ ErrorCode::Unauthorized,
    )]
    pub parent1: Account<'info, PetAccount>,

    #[account(
        mut,
        seeds = [PetAccount::SEED, owner.key().as_ref(), &parent2.id.to_le_bytes()],
        bump = parent2.bump,
        constraint = parent2.owner == owner.key() @ ErrorCode::Unauthorized,
    )]
    pub parent2: Account<'info, PetAccount>,

    #[account(
        init,
        payer = owner,
        seeds = [PetAccount::SEED, owner.key().as_ref(), &global_state.next_pet_id.to_le_bytes()],
        bump,
        space = PetAccount::SPACE,
    )]
    pub child: Account<'info, PetAccount>,

    pub system_program: Program<'info, System>,
}
