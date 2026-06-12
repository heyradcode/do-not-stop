use anchor_lang::prelude::*;

use crate::{
    errors::ErrorCode,
    state::{
        GlobalState, MAX_BATTLE_COOLDOWN_SECONDS, MAX_LEVEL_UP_FEE_LAMPORTS,
        MAX_RANDOMNESS_EXPIRY_SLOTS,
    },
};

pub fn set_battle_cooldown_seconds(ctx: Context<SetConfig>, value: i64) -> Result<()> {
    require!(
        (0..=MAX_BATTLE_COOLDOWN_SECONDS).contains(&value),
        ErrorCode::InvalidBattleCooldown
    );
    ctx.accounts.global_state.battle_cooldown_seconds = value;
    emit!(BattleCooldownUpdated { value });
    Ok(())
}

pub fn set_attack_victory_probability(ctx: Context<SetConfig>, value: u8) -> Result<()> {
    require!(value <= 100, ErrorCode::InvalidAttackVictoryProbability);
    ctx.accounts.global_state.attack_victory_probability = value;
    emit!(AttackVictoryProbabilityUpdated { value });
    Ok(())
}

pub fn set_level_up_fee_lamports(ctx: Context<SetConfig>, value: u64) -> Result<()> {
    require!(value <= MAX_LEVEL_UP_FEE_LAMPORTS, ErrorCode::InvalidLevelUpFee);
    ctx.accounts.global_state.level_up_fee_lamports = value;
    emit!(LevelUpFeeUpdated { value });
    Ok(())
}

pub fn set_randomness_expiry_slots(ctx: Context<SetConfig>, value: u64) -> Result<()> {
    require!(
        (1..=MAX_RANDOMNESS_EXPIRY_SLOTS).contains(&value),
        ErrorCode::InvalidRandomnessExpirySlots
    );
    ctx.accounts.global_state.randomness_expiry_slots = value;
    emit!(RandomnessExpirySlotsUpdated { value });
    Ok(())
}

pub fn set_max_level(ctx: Context<SetConfig>, value: u16) -> Result<()> {
    require!(value > 0, ErrorCode::InvalidMaxLevel);
    ctx.accounts.global_state.max_level = value;
    emit!(MaxLevelUpdated { value });
    Ok(())
}

pub fn set_level_band_width(ctx: Context<SetConfig>, value: u16) -> Result<()> {
    ctx.accounts.global_state.level_band_width = value;
    emit!(LevelBandWidthUpdated { value });
    Ok(())
}

#[event]
pub struct BattleCooldownUpdated {
    pub value: i64,
}

#[event]
pub struct AttackVictoryProbabilityUpdated {
    pub value: u8,
}

#[event]
pub struct LevelUpFeeUpdated {
    pub value: u64,
}

#[event]
pub struct RandomnessExpirySlotsUpdated {
    pub value: u64,
}

#[event]
pub struct MaxLevelUpdated {
    pub value: u16,
}

#[event]
pub struct LevelBandWidthUpdated {
    pub value: u16,
}

#[derive(Accounts)]
pub struct SetConfig<'info> {
    #[account(mut, seeds = [GlobalState::SEED], bump = global_state.bump, has_one = admin)]
    pub global_state: Account<'info, GlobalState>,
    pub admin: Signer<'info>,
}
