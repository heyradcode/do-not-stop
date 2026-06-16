use anchor_lang::prelude::*;

use crate::{
    errors::ErrorCode,
    game::{combat::{self, SkillConfig}, xp::calc_xp},
    utils::metadata::core_asset_owner,
    utils::randomness::read_revealed_randomness,
    state::{BattleRequest, GlobalState, PetAccount},
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
    require_keys_eq!(
        core_asset_owner(&ctx.accounts.attacker_asset.to_account_info())?,
        ctx.accounts.attacker_owner.key(),
        ErrorCode::Unauthorized
    );
    require_keys_eq!(
        core_asset_owner(&ctx.accounts.defender_asset.to_account_info())?,
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

    let seed = read_revealed_randomness(
        &ctx.accounts.randomness_account_data.to_account_info(),
        battle_request.randomness_account,
        battle_request.commit_slot,
    )?;

    let max_level = ctx.accounts.global_state.max_level;
    let attacker_pet_id = ctx.accounts.attacker_pet.id;
    let defender_pet_id = ctx.accounts.defender_pet.id;

    // Skill archetype (plan §3.7/v2.1 Phase B, mirrors EVM `GameLogicV1.fight`'s
    // `uint8(p.speciesId % 8)`): each pet's passive skill is derived from its species id,
    // resolved once at mint/breed time.
    let attacker_skill = (ctx.accounts.attacker_pet.species_id % 8) as u8;
    let defender_skill = (ctx.accounts.defender_pet.species_id % 8) as u8;

    let sim = combat::simulate(
        ctx.accounts.attacker_pet.dna,
        ctx.accounts.attacker_pet.rarity,
        ctx.accounts.attacker_pet.level,
        attacker_skill,
        ctx.accounts.defender_pet.dna,
        ctx.accounts.defender_pet.rarity,
        ctx.accounts.defender_pet.level,
        defender_skill,
        seed,
        &SkillConfig::default(),
    );

    let attacker_pet = &mut ctx.accounts.attacker_pet;
    let defender_pet = &mut ctx.accounts.defender_pet;

    // XP formula (plan §3.4): xpMult = clamp(100 + 10*(oppLevel - myLevel), 0, 200).
    // Winner +100 XP x mult / 100. Loser +25 XP x mult / 100.
    // Same-opponent decay: consecutive battles vs the same foe halve XP each time.
    let attacker_decay = attacker_pet.record_battle_opponent(defender_pet_id);
    let defender_decay = defender_pet.record_battle_opponent(attacker_pet_id);

    let (winner_level, loser_level, winner_decay, loser_decay) = if sim.first_wins {
        (
            attacker_pet.level,
            defender_pet.level,
            attacker_decay,
            defender_decay,
        )
    } else {
        (
            defender_pet.level,
            attacker_pet.level,
            defender_decay,
            attacker_decay,
        )
    };
    // Clamp the shift to u32's bit width: `same_opponent_streak` (u8) can reach 255, and a
    // shift >= 32 panics with `overflow-checks = true`. Values this large already yield 0
    // (base XP <= 200 < 2^8), matching Solidity's "shift >= width => 0" semantics.
    let xp_win = calc_xp(100, winner_level, loser_level) >> winner_decay.min(31);
    let xp_loss = calc_xp(25, loser_level, winner_level) >> loser_decay.min(31);

    let (winner_pet_id, loser_pet_id) = if sim.first_wins {
        (attacker_pet_id, defender_pet_id)
    } else {
        (defender_pet_id, attacker_pet_id)
    };

    if sim.first_wins {
        attacker_pet.win_count = attacker_pet
            .win_count
            .checked_add(1)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
        defender_pet.loss_count = defender_pet
            .loss_count
            .checked_add(1)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
        if xp_win > 0 {
            attacker_pet.add_xp(xp_win, max_level)?;
        }
        if xp_loss > 0 {
            defender_pet.add_xp(xp_loss, max_level)?;
        }
    } else {
        defender_pet.win_count = defender_pet
            .win_count
            .checked_add(1)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
        attacker_pet.loss_count = attacker_pet
            .loss_count
            .checked_add(1)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
        if xp_win > 0 {
            defender_pet.add_xp(xp_win, max_level)?;
        }
        if xp_loss > 0 {
            attacker_pet.add_xp(xp_loss, max_level)?;
        }
    }

    emit!(BattleResolved {
        attacker_pet_id,
        defender_pet_id,
        winner_pet_id,
        loser_pet_id,
        seed,
        first_wins: sim.first_wins,
        rounds: sim.rounds,
        winner_hp_remaining: sim.winner_hp_remaining,
        xp_win,
        xp_loss,
    });

    Ok(())
}

#[event]
pub struct BattleResolved {
    pub attacker_pet_id: u32,
    pub defender_pet_id: u32,
    pub winner_pet_id: u32,
    pub loser_pet_id: u32,
    pub seed: [u8; 32],
    pub first_wins: bool,
    pub rounds: u8,
    pub winner_hp_remaining: u16,
    pub xp_win: u32,
    pub xp_loss: u32,
}

#[derive(Accounts)]
pub struct SettleBattle<'info> {
    #[account(seeds = [GlobalState::SEED], bump = global_state.bump)]
    pub global_state: Account<'info, GlobalState>,

    #[account(mut)]
    pub attacker_owner: Signer<'info>,

    /// CHECK: attacker pet's Metaplex Core asset account; PDA seed for `attacker_pet`
    /// and source of truth for ownership (plan §2.3/v2.1 Phase A).
    #[account(owner = mpl_core::ID)]
    pub attacker_asset: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [PetAccount::SEED, attacker_asset.key().as_ref()],
        bump = attacker_pet.bump,
    )]
    pub attacker_pet: Account<'info, PetAccount>,

    /// CHECK: must match `battle_request.defender_owner`.
    pub defender_owner: UncheckedAccount<'info>,

    /// CHECK: defender pet's Metaplex Core asset account; PDA seed for `defender_pet`
    /// and source of truth for ownership (plan §2.3/v2.1 Phase A).
    #[account(owner = mpl_core::ID)]
    pub defender_asset: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [PetAccount::SEED, defender_asset.key().as_ref()],
        bump = defender_pet.bump,
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

