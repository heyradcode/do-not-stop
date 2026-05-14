use crate::state::GlobalState;
use anchor_lang::prelude::*;

pub fn handler(ctx: Context<Pause>) -> Result<()> {
    let global_state = &mut ctx.accounts.global_state;
    global_state.paused = true;
    Ok(())
}

#[derive(Accounts)]
pub struct Pause<'info> {
    #[account(mut, seeds = [GlobalState::SEED], bump = global_state.bump, has_one = admin)]
    pub global_state: Account<'info, GlobalState>,
    pub admin: Signer<'info>,
}
