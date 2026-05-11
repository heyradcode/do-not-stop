use anchor_lang::prelude::*;

pub fn handler(ctx: Context<crate::Initialize>, level_up_fee_lamports: u64) -> Result<()> {
    let global_state = &mut ctx.accounts.global_state;

    global_state.admin = ctx.accounts.admin.key();
    global_state.level_up_fee_lamports = level_up_fee_lamports;
    global_state.next_zombie_id = 1;
    global_state.paused = false;
    global_state.bump = ctx.bumps.global_state;

    Ok(())
}
