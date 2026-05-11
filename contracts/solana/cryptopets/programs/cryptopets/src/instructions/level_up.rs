use anchor_lang::prelude::*;

pub fn handler(ctx: Context<crate::LevelUp>) -> Result<()> {
    let global_state = &mut ctx.accounts.global_state;
    let zombie = &mut ctx.accounts.zombie;

    // enforce pause
    require!(!global_state.paused, crate::errors::ErrorCode::Paused);

    require_keys_eq!(
        zombie.owner,
        ctx.accounts.owner.key(),
        LevelUpError::Unauthorized
    );

    // transfer lamports to global state (program-owned)
    let fee = global_state.level_up_fee_lamports;
    require!(fee > 0, LevelUpError::InvalidFee);

    let cpi_ctx = CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        anchor_lang::system_program::Transfer {
            from: ctx.accounts.owner.to_account_info(),
            to: ctx.accounts.global_state.to_account_info(),
        },
    );
    anchor_lang::system_program::transfer(cpi_ctx, fee)?;

    zombie.level = zombie.level.checked_add(1).unwrap();

    Ok(())
}

#[error_code]
pub enum LevelUpError {
    #[msg("Zombie fee invalid")]
    InvalidFee,
    #[msg("Not authorized to level this zombie")]
    Unauthorized,
}
