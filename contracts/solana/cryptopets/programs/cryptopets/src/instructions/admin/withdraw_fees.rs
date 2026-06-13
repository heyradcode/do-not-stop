use anchor_lang::{
    prelude::*,
    system_program::{transfer, Transfer},
};

use crate::{
    errors::ErrorCode,
    state::{GlobalState, FEE_VAULT_SEED},
};

pub fn handler(ctx: Context<WithdrawFees>, amount: u64) -> Result<()> {
    require!(
        ctx.accounts.fee_vault.lamports() >= amount,
        ErrorCode::InsufficientFeeVaultBalance
    );

    let signer_seeds: &[&[&[u8]]] = &[&[FEE_VAULT_SEED, &[ctx.bumps.fee_vault]]];
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.system_program.to_account_info(),
        Transfer {
            from: ctx.accounts.fee_vault.to_account_info(),
            to: ctx.accounts.admin.to_account_info(),
        },
        signer_seeds,
    );
    transfer(cpi_ctx, amount)?;

    emit!(FeesWithdrawn {
        amount,
        recipient: ctx.accounts.admin.key(),
    });

    Ok(())
}

#[event]
pub struct FeesWithdrawn {
    pub amount: u64,
    pub recipient: Pubkey,
}

#[derive(Accounts)]
pub struct WithdrawFees<'info> {
    #[account(seeds = [GlobalState::SEED], bump = global_state.bump, has_one = admin)]
    pub global_state: Account<'info, GlobalState>,

    #[account(mut, seeds = [FEE_VAULT_SEED], bump)]
    pub fee_vault: SystemAccount<'info>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}
