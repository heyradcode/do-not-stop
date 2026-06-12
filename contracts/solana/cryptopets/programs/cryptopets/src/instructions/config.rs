use anchor_lang::prelude::*;

use crate::{
    errors::ErrorCode,
    state::{
        GlobalState, MAX_BATTLE_COOLDOWN_SECONDS, MAX_BREED_COOLDOWN_BASE_SECONDS,
        MAX_GENERATION_CAP, MAX_LEVEL_UP_FEE_LAMPORTS, MAX_NEWBORN_COOLDOWN_SECONDS,
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

pub fn set_generation_cap(ctx: Context<SetConfig>, value: u8) -> Result<()> {
    require!(
        (1..=MAX_GENERATION_CAP).contains(&value),
        ErrorCode::InvalidGenerationCap
    );
    ctx.accounts.global_state.generation_cap = value;
    emit!(GenerationCapUpdated { value });
    Ok(())
}

pub fn set_breed_cooldown_base_seconds(ctx: Context<SetConfig>, value: i64) -> Result<()> {
    require!(
        (0..=MAX_BREED_COOLDOWN_BASE_SECONDS).contains(&value),
        ErrorCode::InvalidBreedCooldownBase
    );
    ctx.accounts.global_state.breed_cooldown_base_seconds = value;
    emit!(BreedCooldownBaseUpdated { value });
    Ok(())
}

pub fn set_newborn_cooldown_seconds(ctx: Context<SetConfig>, value: i64) -> Result<()> {
    require!(
        (0..=MAX_NEWBORN_COOLDOWN_SECONDS).contains(&value),
        ErrorCode::InvalidNewbornCooldown
    );
    ctx.accounts.global_state.newborn_cooldown_seconds = value;
    emit!(NewbornCooldownUpdated { value });
    Ok(())
}

#[event]
pub struct BattleCooldownUpdated {
    pub value: i64,
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

#[event]
pub struct GenerationCapUpdated {
    pub value: u8,
}

#[event]
pub struct BreedCooldownBaseUpdated {
    pub value: i64,
}

#[event]
pub struct NewbornCooldownUpdated {
    pub value: i64,
}

#[derive(Accounts)]
pub struct SetConfig<'info> {
    #[account(mut, seeds = [GlobalState::SEED], bump = global_state.bump, has_one = admin)]
    pub global_state: Account<'info, GlobalState>,
    pub admin: Signer<'info>,
}
