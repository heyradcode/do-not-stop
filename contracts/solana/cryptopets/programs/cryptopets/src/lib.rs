pub mod errors;
pub mod instructions;
pub mod state;

use anchor_lang::{prelude::*, solana_program::system_program};
use instructions::*;

declare_id!("78AXV46ks5oFoJHkukvbsfZTJixdj2MeStzuC6thiUry");

#[program]
pub mod cryptopets {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, level_up_fee_lamports: u64) -> Result<()> {
        initialize::handler(ctx, level_up_fee_lamports)
    }

    pub fn create_starter_pet(
        ctx: Context<CreateStarterPet>,
        name: String,
        dna: u64,
        rarity: u8,
    ) -> Result<()> {
        create_starter_pet::handler(ctx, name, dna, rarity)
    }

    pub fn level_up(ctx: Context<LevelUp>) -> Result<()> {
        level_up::handler(ctx)
    }

    pub fn rename_pet(ctx: Context<RenamePet>, name: String) -> Result<()> {
        rename_pet::handler(ctx, name)
    }

    pub fn pause(ctx: Context<Pause>) -> Result<()> {
        pause::handler(ctx)
    }

    pub fn unpause(ctx: Context<Unpause>) -> Result<()> {
        unpause::handler(ctx)
    }
}
