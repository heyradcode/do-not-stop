use anchor_lang::prelude::*;

use crate::{errors::ErrorCode, state::StudFeeAccount};

/// Pull payment for stud fees credited by cross-owner breed settlements (plan §4.4,
/// mirrors EVM `withdrawStudFees`). `StudFeeAccount.amount` lamports were credited
/// immediately at `commit_breed` time, so this simply zeroes the tracked amount and
/// moves the matching lamports out via direct lamport manipulation (CPI transfers
/// cannot move lamports out of a program-owned account).
pub fn handler(ctx: Context<WithdrawStudFees>) -> Result<()> {
    let amount = ctx.accounts.stud_fee_account.amount;
    require!(amount > 0, ErrorCode::NoStudFeesToWithdraw);

    ctx.accounts.stud_fee_account.amount = 0;

    let stud_fee_account_info = ctx.accounts.stud_fee_account.to_account_info();
    let new_stud_fee_balance = stud_fee_account_info
        .lamports()
        .checked_sub(amount)
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    **stud_fee_account_info.try_borrow_mut_lamports()? = new_stud_fee_balance;

    let owner_info = ctx.accounts.owner.to_account_info();
    let new_owner_balance = owner_info
        .lamports()
        .checked_add(amount)
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    **owner_info.try_borrow_mut_lamports()? = new_owner_balance;

    emit!(StudFeesWithdrawnEvent {
        owner: ctx.accounts.owner.key(),
        amount,
    });

    Ok(())
}

#[event]
pub struct StudFeesWithdrawnEvent {
    pub owner: Pubkey,
    pub amount: u64,
}

#[derive(Accounts)]
pub struct WithdrawStudFees<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [StudFeeAccount::SEED, owner.key().as_ref()],
        bump = stud_fee_account.bump,
        constraint = stud_fee_account.owner == owner.key() @ ErrorCode::Unauthorized,
    )]
    pub stud_fee_account: Account<'info, StudFeeAccount>,
}
