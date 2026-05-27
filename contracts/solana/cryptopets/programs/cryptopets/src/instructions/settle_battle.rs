use anchor_lang::prelude::*;

use crate::{
    errors::ErrorCode,
    state::{BattleRequest, GlobalState, PetAccount, ATTACK_VICTORY_PROBABILITY},
    util::{battle_roll_from_vrf, read_revealed_randomness},
};

pub fn handler(ctx: Context<SettleBattle>) -> Result<()> {
    require!(!ctx.accounts.global_state.paused, ErrorCode::Paused);

    let battle_request = &ctx.accounts.battle_request;
    require_keys_eq!(
        battle_request.attacker_owner,
        ctx.accounts.attacker_owner.key(),
        ErrorCode::Unauthorized
    );
    require_keys_eq!(
        battle_request.defender_owner,
        ctx.accounts.defender_owner.key(),
        ErrorCode::Unauthorized
    );
    require!(
        ctx.accounts.attacker_pet.id == battle_request.attacker_pet_id,
        ErrorCode::Unauthorized
    );
    require!(
        ctx.accounts.defender_pet.id == battle_request.defender_pet_id,
        ErrorCode::Unauthorized
    );

    let vrf = read_revealed_randomness(
        &ctx.accounts.randomness_account_data.to_account_info(),
        battle_request.randomness_account,
        battle_request.commit_slot,
    )?;
    let rand = battle_roll_from_vrf(&vrf);
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
pub struct SettleBattle<'info> {
    #[account(seeds = [GlobalState::SEED], bump = global_state.bump)]
    pub global_state: Account<'info, GlobalState>,

    #[account(mut)]
    pub attacker_owner: Signer<'info>,

    #[account(
        mut,
        seeds = [
            PetAccount::SEED,
            attacker_owner.key().as_ref(),
            &battle_request.attacker_pet_id.to_le_bytes(),
        ],
        bump = attacker_pet.bump,
        constraint = attacker_pet.owner == attacker_owner.key() @ ErrorCode::Unauthorized,
    )]
    pub attacker_pet: Account<'info, PetAccount>,

    /// CHECK: must match `battle_request.defender_owner`.
    pub defender_owner: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [
            PetAccount::SEED,
            defender_owner.key().as_ref(),
            &battle_request.defender_pet_id.to_le_bytes(),
        ],
        bump = defender_pet.bump,
        constraint = defender_pet.owner == defender_owner.key() @ ErrorCode::Unauthorized,
    )]
    pub defender_pet: Account<'info, PetAccount>,

    #[account(
        mut,
        close = attacker_owner,
        seeds = [BattleRequest::SEED, attacker_owner.key().as_ref()],
        bump = battle_request.bump,
        constraint = battle_request.attacker_owner == attacker_owner.key() @ ErrorCode::Unauthorized,
    )]
    pub battle_request: Account<'info, BattleRequest>,

    /// CHECK: parsed as Switchboard `RandomnessAccountData` in the handler.
    pub randomness_account_data: UncheckedAccount<'info>,
}
