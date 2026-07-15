use anchor_lang::prelude::*;

use crate::{
    errors::ErrorCode,
    state::{
        GlobalState, MAX_BASE_MINT_FEE_LAMPORTS, MAX_BATTLE_COOLDOWN_SECONDS,
        MAX_BATTLE_FEE_LAMPORTS, MAX_BREED_COOLDOWN_BASE_SECONDS, MAX_BREED_FEE_LAMPORTS,
        MAX_GENERATION_CAP, MAX_LEVEL_UP_FEE_LAMPORTS, MAX_MARRIAGE_COOLDOWN_SECONDS,
        MAX_NEWBORN_COOLDOWN_SECONDS, MAX_PROPOSAL_TTL_SECONDS, MAX_RANDOMNESS_EXPIRY_SLOTS,
        MAX_STUD_FEE_LAMPORTS, MAX_TRAIN_COOLDOWN_SECONDS, MAX_TRAIN_FEE_LAMPORTS, MAX_TRAIN_XP,
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

/// Mirrors EVM `GameConfig.setPoolSize` (plan §3.7): `tier` is the rarity tier (1..=5),
/// `size` is the species pool size for that tier (`0` = "no species" for that tier).
pub fn set_pool_size(ctx: Context<SetConfig>, tier: u8, size: u8) -> Result<()> {
    require!((1..=5).contains(&tier), ErrorCode::InvalidRarity);
    ctx.accounts.global_state.pool_sizes[(tier - 1) as usize] = size;
    emit!(PoolSizeUpdated { tier, size });
    Ok(())
}

/// Mirrors EVM `GameConfig.setBaseMintFee` (plan §4.3): base fee for the gacha mint,
/// escalated per wallet by `commit_mint`.
pub fn set_base_mint_fee_lamports(ctx: Context<SetConfig>, value: u64) -> Result<()> {
    require!(value <= MAX_BASE_MINT_FEE_LAMPORTS, ErrorCode::InvalidBaseMintFee);
    ctx.accounts.global_state.base_mint_fee_lamports = value;
    emit!(BaseMintFeeUpdated { value });
    Ok(())
}

/// Mirrors EVM `GameConfig.setTrainFee` (plan §3.4): base fee for `train`, scaled per
/// pet level by `train_fee_for`.
pub fn set_train_fee_lamports(ctx: Context<SetConfig>, value: u64) -> Result<()> {
    require!(value <= MAX_TRAIN_FEE_LAMPORTS, ErrorCode::InvalidTrainFee);
    ctx.accounts.global_state.train_fee_lamports = value;
    emit!(TrainFeeUpdated { value });
    Ok(())
}

/// Mirrors EVM `GameConfig.setTrainCooldown` (plan §3.4).
pub fn set_train_cooldown_seconds(ctx: Context<SetConfig>, value: i64) -> Result<()> {
    require!(
        (0..=MAX_TRAIN_COOLDOWN_SECONDS).contains(&value),
        ErrorCode::InvalidTrainCooldown
    );
    ctx.accounts.global_state.train_cooldown_seconds = value;
    emit!(TrainCooldownUpdated { value });
    Ok(())
}

/// Mirrors EVM `GameConfig.setTrainXp` (plan §3.4): flat XP granted per `train`.
pub fn set_train_xp(ctx: Context<SetConfig>, value: u32) -> Result<()> {
    require!(value <= MAX_TRAIN_XP, ErrorCode::InvalidTrainXp);
    ctx.accounts.global_state.train_xp = value;
    emit!(TrainXpUpdated { value });
    Ok(())
}

/// Mirrors EVM `GameConfig.setBreedFee` (plan §4.3): fee charged by `commit_breed`.
pub fn set_breed_fee_lamports(ctx: Context<SetConfig>, value: u64) -> Result<()> {
    require!(value <= MAX_BREED_FEE_LAMPORTS, ErrorCode::InvalidBreedFee);
    ctx.accounts.global_state.breed_fee_lamports = value;
    emit!(BreedFeeUpdated { value });
    Ok(())
}

/// Mirrors EVM `GameConfig.setBattleFee`: fee charged by `commit_battle`, funding the
/// settle keeper's `settle_battle` transaction.
pub fn set_battle_fee_lamports(ctx: Context<SetConfig>, value: u64) -> Result<()> {
    require!(value <= MAX_BATTLE_FEE_LAMPORTS, ErrorCode::InvalidBattleFee);
    ctx.accounts.global_state.battle_fee_lamports = value;
    emit!(BattleFeeUpdated { value });
    Ok(())
}

/// Mirrors EVM `GameConfig.setStudFee` (plan §4.4): fee paid by the proposer's spouse's
/// owner to the proposer when breeding across a marriage.
pub fn set_stud_fee_lamports(ctx: Context<SetConfig>, value: u64) -> Result<()> {
    require!(value <= MAX_STUD_FEE_LAMPORTS, ErrorCode::InvalidStudFee);
    ctx.accounts.global_state.stud_fee_lamports = value;
    emit!(StudFeeUpdated { value });
    Ok(())
}

/// Mirrors EVM `GameConfig.setMarriageCooldown` (plan §4.4): minimum time before a wallet
/// may propose another marriage after a divorce.
pub fn set_marriage_cooldown_seconds(ctx: Context<SetConfig>, value: i64) -> Result<()> {
    require!(
        (0..=MAX_MARRIAGE_COOLDOWN_SECONDS).contains(&value),
        ErrorCode::InvalidMarriageCooldown
    );
    ctx.accounts.global_state.marriage_cooldown_seconds = value;
    emit!(MarriageCooldownUpdated { value });
    Ok(())
}

/// Mirrors EVM `GameConfig.setProposalTTL` (plan §4.4): how long a marriage proposal
/// remains acceptable before it can be cleared as stale.
pub fn set_proposal_ttl_seconds(ctx: Context<SetConfig>, value: i64) -> Result<()> {
    require!(
        (0..=MAX_PROPOSAL_TTL_SECONDS).contains(&value),
        ErrorCode::InvalidProposalTtl
    );
    ctx.accounts.global_state.proposal_ttl_seconds = value;
    emit!(ProposalTtlUpdated { value });
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

#[event]
pub struct PoolSizeUpdated {
    pub tier: u8,
    pub size: u8,
}

#[event]
pub struct BaseMintFeeUpdated {
    pub value: u64,
}

#[event]
pub struct TrainFeeUpdated {
    pub value: u64,
}

#[event]
pub struct TrainCooldownUpdated {
    pub value: i64,
}

#[event]
pub struct TrainXpUpdated {
    pub value: u32,
}

#[event]
pub struct BreedFeeUpdated {
    pub value: u64,
}

#[event]
pub struct BattleFeeUpdated {
    pub value: u64,
}

#[event]
pub struct StudFeeUpdated {
    pub value: u64,
}

#[event]
pub struct MarriageCooldownUpdated {
    pub value: i64,
}

#[event]
pub struct ProposalTtlUpdated {
    pub value: i64,
}

#[derive(Accounts)]
pub struct SetConfig<'info> {
    #[account(mut, seeds = [GlobalState::SEED], bump = global_state.bump, has_one = admin)]
    pub global_state: Account<'info, GlobalState>,
    pub admin: Signer<'info>,
}
