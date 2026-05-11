use anchor_lang::prelude::*;

pub fn handler(ctx: Context<crate::Pause>) -> Result<()> {
    let global_state = &mut ctx.accounts.global_state;
    global_state.paused = true;
    Ok(())
}
