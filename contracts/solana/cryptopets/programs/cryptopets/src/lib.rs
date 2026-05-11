pub mod errors;
pub mod instructions;
pub mod state;

use anchor_lang::{prelude::*, solana_program::system_program};
use instructions::{
    create_starter_zombie, initialize, level_up, pause, rename_zombie, unpause,
};

declare_id!("3f27FrpJ9yYTWqWbqq83x3XTSmQHXwJfLKzNjfNj2P6g");

#[program]
pub mod cryptopets {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        level_up_fee_lamports: u64,
    ) -> Result<()> {
        initialize::handler(ctx, level_up_fee_lamports)
    }

    pub fn create_starter_zombie(
        ctx: Context<CreateStarterZombie>,
        name: String,
        dna: u64,
        rarity: u8,
    ) -> Result<()> {
        create_starter_zombie::handler(ctx, name, dna, rarity)
    }

    pub fn level_up(ctx: Context<LevelUp>) -> Result<()> {
        level_up::handler(ctx)
    }

    pub fn rename_zombie(ctx: Context<RenameZombie>, name: String) -> Result<()> {
        rename_zombie::handler(ctx, name)
    }

    pub fn pause(ctx: Context<Pause>) -> Result<()> {
        pause::handler(ctx)
    }

    pub fn unpause(ctx: Context<Unpause>) -> Result<()> {
        unpause::handler(ctx)
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = admin,
        seeds = [state::GlobalState::SEED],
        bump,
        space = state::GlobalState::SPACE,
    )]
    pub global_state: Account<'info, state::GlobalState>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateStarterZombie<'info> {
    #[account(
        mut,
        seeds = [state::GlobalState::SEED],
        bump = global_state.bump,
    )]
    pub global_state: Account<'info, state::GlobalState>,
    #[account(
        init_if_needed,
        payer = owner,
        seeds = [state::PlayerProfile::SEED, owner.key().as_ref()],
        bump,
        space = state::PlayerProfile::SPACE,
    )]
    pub player_profile: Account<'info, state::PlayerProfile>,
    #[account(
        init,
        payer = owner,
        seeds = [state::ZombieAccount::SEED, owner.key().as_ref(), &global_state.next_zombie_id.to_le_bytes()],
        bump,
        space = state::ZombieAccount::SPACE,
    )]
    pub zombie: Account<'info, state::ZombieAccount>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct LevelUp<'info> {
    #[account(
        mut,
        seeds = [state::GlobalState::SEED],
        bump = global_state.bump,
    )]
    pub global_state: Account<'info, state::GlobalState>,
    #[account(
        mut,
        seeds = [state::ZombieAccount::SEED, owner.key().as_ref(), &zombie.id.to_le_bytes()],
        bump = zombie.bump,
    )]
    pub zombie: Account<'info, state::ZombieAccount>,
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(address = system_program::ID)]
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RenameZombie<'info> {
    #[account(
        seeds = [state::GlobalState::SEED],
        bump = global_state.bump,
    )]
    pub global_state: Account<'info, state::GlobalState>,
    #[account(
        mut,
        seeds = [state::ZombieAccount::SEED, owner.key().as_ref(), &zombie.id.to_le_bytes()],
        bump = zombie.bump,
    )]
    pub zombie: Account<'info, state::ZombieAccount>,
    #[account(mut)]
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct Pause<'info> {
    #[account(mut, seeds = [state::GlobalState::SEED], bump = global_state.bump, has_one = admin)]
    pub global_state: Account<'info, state::GlobalState>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct Unpause<'info> {
    #[account(mut, seeds = [state::GlobalState::SEED], bump = global_state.bump, has_one = admin)]
    pub global_state: Account<'info, state::GlobalState>,
    pub admin: Signer<'info>,
}
