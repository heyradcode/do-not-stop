use anchor_lang::prelude::*;

use crate::{
    errors::ErrorCode,
    state::{GlobalState, PetAccount, ATTACK_VICTORY_PROBABILITY},
    util::pseudo_random,
};

pub fn handler(ctx: Context<Battle>) -> Result<()> {
    require!(!ctx.accounts.global_state.paused, ErrorCode::Paused);

    let now = Clock::get()?.unix_timestamp;
    let slot = Clock::get()?.slot;

    require!(
        ctx.accounts.attacker_pet.key() != ctx.accounts.defender_pet.key(),
        ErrorCode::CannotBattleSelf
    );

    {
        let attacker_pet = &ctx.accounts.attacker_pet;
        let defender_pet = &ctx.accounts.defender_pet;
        require_keys_eq!(
            attacker_pet.owner,
            ctx.accounts.attacker_owner.key(),
            ErrorCode::Unauthorized
        );
        require!(attacker_pet.is_ready(now), ErrorCode::PetNotReady);
        require!(defender_pet.is_ready(now), ErrorCode::PetNotReady);
    }

    let rand = pseudo_random(&[
        &slot.to_le_bytes(),
        &now.to_le_bytes(),
        &ctx.accounts.attacker_owner.key().to_bytes(),
        &ctx.accounts.attacker_pet.id.to_le_bytes(),
        &ctx.accounts.defender_pet.id.to_le_bytes(),
    ]);
    let attacker_wins = (rand % 100) < ATTACK_VICTORY_PROBABILITY as u64;

    let attacker_pet = &mut ctx.accounts.attacker_pet;
    let defender_pet = &mut ctx.accounts.defender_pet;

    if attacker_wins {
        attacker_pet.win_count = attacker_pet
            .win_count
            .checked_add(1)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
        defender_pet.loss_count = defender_pet
            .loss_count
            .checked_add(1)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
        attacker_pet.level = attacker_pet
            .level
            .checked_add(1)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
    } else {
        defender_pet.win_count = defender_pet
            .win_count
            .checked_add(1)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
        attacker_pet.loss_count = attacker_pet
            .loss_count
            .checked_add(1)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
        defender_pet.level = defender_pet
            .level
            .checked_add(1)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
    }

    attacker_pet.trigger_cooldown(now);
    defender_pet.trigger_cooldown(now);

    emit!(BattleResult {
        attacker_pet_id: attacker_pet.id,
        defender_pet_id: defender_pet.id,
        attacker_won: attacker_wins,
    });

    Ok(())
}

#[event]
pub struct BattleResult {
    pub attacker_pet_id: u32,
    pub defender_pet_id: u32,
    pub attacker_won: bool,
}

#[derive(Accounts)]
pub struct Battle<'info> {
    #[account(seeds = [GlobalState::SEED], bump = global_state.bump)]
    pub global_state: Account<'info, GlobalState>,

    #[account(mut)]
    pub attacker_owner: Signer<'info>,

    #[account(
        mut,
        seeds = [
            PetAccount::SEED,
            attacker_owner.key().as_ref(),
            &attacker_pet.id.to_le_bytes(),
        ],
        bump = attacker_pet.bump,
        constraint = attacker_pet.owner == attacker_owner.key() @ ErrorCode::Unauthorized,
    )]
    pub attacker_pet: Account<'info, PetAccount>,

    /// CHECK: defender wallet pubkey is used purely as a PDA seed for `defender_pet`.
    pub defender_owner: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [
            PetAccount::SEED,
            defender_owner.key().as_ref(),
            &defender_pet.id.to_le_bytes(),
        ],
        bump = defender_pet.bump,
        constraint = defender_pet.owner == defender_owner.key() @ ErrorCode::Unauthorized,
    )]
    pub defender_pet: Account<'info, PetAccount>,
}
