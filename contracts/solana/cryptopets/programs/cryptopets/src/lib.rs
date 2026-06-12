pub mod combat;
pub mod dna;
pub mod errors;
pub mod instructions;
pub mod rarity;
pub mod state;
pub mod util;

use anchor_lang::{prelude::*, solana_program::system_program};
use instructions::*;

declare_id!("78AXV46ks5oFoJHkukvbsfZTJixdj2MeStzuC6thiUry");

#[program]
pub mod cryptopets {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, level_up_fee_lamports: u64) -> Result<()> {
        initialize::handler(ctx, level_up_fee_lamports)
    }

    pub fn create_starter_pet(ctx: Context<CreateStarterPet>, name: String) -> Result<()> {
        create_starter_pet::handler(ctx, name)
    }

    pub fn level_up(ctx: Context<LevelUp>) -> Result<()> {
        level_up::handler(ctx)
    }

    pub fn rename_pet(ctx: Context<RenamePet>, name: String) -> Result<()> {
        rename_pet::handler(ctx, name)
    }

    pub fn set_open_to_challenges(ctx: Context<SetOpenToChallenges>, value: bool) -> Result<()> {
        set_open_to_challenges::handler(ctx, value)
    }

    pub fn transfer_pet(ctx: Context<TransferPet>) -> Result<()> {
        transfer_pet::handler(ctx)
    }

    pub fn pause(ctx: Context<Pause>) -> Result<()> {
        pause::handler(ctx)
    }

    pub fn unpause(ctx: Context<Unpause>) -> Result<()> {
        unpause::handler(ctx)
    }

    pub fn commit_battle(
        ctx: Context<CommitBattle>,
        randomness_account: Pubkey,
    ) -> Result<()> {
        commit_battle::handler(ctx, randomness_account)
    }

    pub fn settle_battle(ctx: Context<SettleBattle>) -> Result<()> {
        settle_battle::handler(ctx)
    }

    pub fn commit_breed(
        ctx: Context<CommitBreed>,
        randomness_account: Pubkey,
        name: String,
    ) -> Result<()> {
        commit_breed::handler(ctx, randomness_account, name)
    }

    pub fn settle_breed(ctx: Context<SettleBreed>) -> Result<()> {
        settle_breed::handler(ctx)
    }

    pub fn cancel_battle(ctx: Context<CancelBattle>) -> Result<()> {
        cancel_battle::handler(ctx)
    }

    pub fn cancel_breed(ctx: Context<CancelBreed>) -> Result<()> {
        cancel_breed::handler(ctx)
    }

    pub fn set_battle_cooldown_seconds(ctx: Context<SetConfig>, value: i64) -> Result<()> {
        config::set_battle_cooldown_seconds(ctx, value)
    }

    pub fn set_level_up_fee_lamports(ctx: Context<SetConfig>, value: u64) -> Result<()> {
        config::set_level_up_fee_lamports(ctx, value)
    }

    pub fn set_randomness_expiry_slots(ctx: Context<SetConfig>, value: u64) -> Result<()> {
        config::set_randomness_expiry_slots(ctx, value)
    }

    pub fn set_max_level(ctx: Context<SetConfig>, value: u16) -> Result<()> {
        config::set_max_level(ctx, value)
    }

    pub fn set_level_band_width(ctx: Context<SetConfig>, value: u16) -> Result<()> {
        config::set_level_band_width(ctx, value)
    }

    pub fn set_generation_cap(ctx: Context<SetConfig>, value: u8) -> Result<()> {
        config::set_generation_cap(ctx, value)
    }

    pub fn set_breed_cooldown_base_seconds(ctx: Context<SetConfig>, value: i64) -> Result<()> {
        config::set_breed_cooldown_base_seconds(ctx, value)
    }

    pub fn set_newborn_cooldown_seconds(ctx: Context<SetConfig>, value: i64) -> Result<()> {
        config::set_newborn_cooldown_seconds(ctx, value)
    }

    pub fn set_pool_size(ctx: Context<SetConfig>, tier: u8, size: u8) -> Result<()> {
        config::set_pool_size(ctx, tier, size)
    }

    pub fn set_base_mint_fee_lamports(ctx: Context<SetConfig>, value: u64) -> Result<()> {
        config::set_base_mint_fee_lamports(ctx, value)
    }

    pub fn set_train_fee_lamports(ctx: Context<SetConfig>, value: u64) -> Result<()> {
        config::set_train_fee_lamports(ctx, value)
    }

    pub fn set_train_cooldown_seconds(ctx: Context<SetConfig>, value: i64) -> Result<()> {
        config::set_train_cooldown_seconds(ctx, value)
    }

    pub fn set_train_xp(ctx: Context<SetConfig>, value: u32) -> Result<()> {
        config::set_train_xp(ctx, value)
    }

    pub fn withdraw_fees(ctx: Context<WithdrawFees>, amount: u64) -> Result<()> {
        withdraw_fees::handler(ctx, amount)
    }
}
