use crate::{
    errors::ErrorCode,
    state::{
        GlobalState, PetAccount, CURRENT_ACCOUNT_VERSION, DEFAULT_BATTLE_COOLDOWN_SECONDS,
        DEFAULT_LEVEL_BAND_WIDTH, DEFAULT_MAX_LEVEL, DEFAULT_RANDOMNESS_EXPIRY_SLOTS,
    },
};
use anchor_lang::prelude::*;

pub fn handler(ctx: Context<Initialize>, level_up_fee_lamports: u64) -> Result<()> {
    let global_state = &mut ctx.accounts.global_state;

    global_state.admin = ctx.accounts.admin.key();
    global_state.level_up_fee_lamports = level_up_fee_lamports;
    global_state.battle_cooldown_seconds = DEFAULT_BATTLE_COOLDOWN_SECONDS;
    global_state.randomness_expiry_slots = DEFAULT_RANDOMNESS_EXPIRY_SLOTS;
    global_state.max_level = DEFAULT_MAX_LEVEL;
    global_state.level_band_width = DEFAULT_LEVEL_BAND_WIDTH;
    global_state.next_pet_id = 1;
    global_state.paused = false;
    global_state.version = CURRENT_ACCOUNT_VERSION;
    global_state.bump = ctx.bumps.global_state;

    Ok(())
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = admin,
        seeds = [GlobalState::SEED],
        bump,
        space = GlobalState::SPACE,
    )]
    pub global_state: Account<'info, GlobalState>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}
