use crate::{errors::ErrorCode, state::GlobalState, state::PetAccount};
use anchor_lang::prelude::*;

pub fn handler(ctx: Context<Unpause>) -> Result<()> {
    let global_state = &mut ctx.accounts.global_state;
    global_state.paused = false;
    Ok(())
}

#[derive(Accounts)]
pub struct Unpause<'info> {
    #[account(mut, seeds = [GlobalState::SEED], bump = global_state.bump, has_one = admin)]
    pub global_state: Account<'info, GlobalState>,
    pub admin: Signer<'info>,
}
