use anchor_lang::prelude::*;

pub fn handler(ctx: Context<crate::Unpause>) -> Result<()> {
    let global_state = &mut ctx.accounts.global_state;
    global_state.paused = false;
    Ok(())
}
