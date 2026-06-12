use anchor_lang::prelude::*;

use crate::{
    errors::ErrorCode,
    state::{BreedRequest, GlobalState, StudFeeAccount},
};

/// Permissionless cleanup (§6 Solana #2): once the committed Switchboard randomness has
/// gone unrevealed for `global_state.randomness_expiry_slots`, anyone may close the stuck
/// `BreedRequest` and refund its rent to the owner who paid for it. `next_pet_id` was not
/// consumed at commit time, so no rollback is needed.
///
/// If a stud fee was escrowed for a cross-owner breed (plan §4.4), its lamports are
/// refunded from `other_owner`'s `StudFeeAccount` back to `owner`, mirroring EVM
/// `cancelBreed`'s `payable(p.owner).call{value: p.studFee}` refund. The escrow's
/// withdrawable `amount` is untouched: it is only credited at `settle_breed`, so a
/// pending escrow's lamports sit in the account uncounted (`withdraw_stud_fees` moves
/// only `amount` lamports and can never take them).
pub fn handler(ctx: Context<CancelBreed>) -> Result<()> {
    let clock = Clock::get()?;
    let expiry_slot = ctx
        .accounts
        .breed_request
        .commit_slot
        .checked_add(ctx.accounts.global_state.randomness_expiry_slots)
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    require!(clock.slot > expiry_slot, ErrorCode::RandomnessNotExpired);

    let stud_fee = ctx.accounts.breed_request.stud_fee;
    if stud_fee > 0 {
        let other_owner = ctx.accounts.breed_request.other_owner;
        let (expected_stud_fee_account, _bump) = Pubkey::find_program_address(
            &[StudFeeAccount::SEED, other_owner.as_ref()],
            ctx.program_id,
        );
        require_keys_eq!(
            ctx.accounts.stud_fee_account.key(),
            expected_stud_fee_account,
            ErrorCode::InvalidStudFeeAccount
        );

        // Lamport-only refund: this request's escrow was never credited to the
        // withdrawable `amount` (that happens at `settle_breed`), so the account
        // balance is rent + `amount` + pending escrows, and subtracting `stud_fee`
        // can only consume this request's own pending portion.
        let stud_fee_account_info = ctx.accounts.stud_fee_account.to_account_info();
        let new_stud_fee_balance = stud_fee_account_info
            .lamports()
            .checked_sub(stud_fee)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
        **stud_fee_account_info.try_borrow_mut_lamports()? = new_stud_fee_balance;

        let owner_info = ctx.accounts.owner.to_account_info();
        let new_owner_balance = owner_info
            .lamports()
            .checked_add(stud_fee)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
        **owner_info.try_borrow_mut_lamports()? = new_owner_balance;
    }

    emit!(BreedCancelledEvent {
        owner: ctx.accounts.breed_request.owner,
        parent1_id: ctx.accounts.breed_request.parent1_id,
        parent2_id: ctx.accounts.breed_request.parent2_id,
        child_id: ctx.accounts.breed_request.child_id,
    });

    Ok(())
}

#[event]
pub struct BreedCancelledEvent {
    pub owner: Pubkey,
    pub parent1_id: u32,
    pub parent2_id: u32,
    pub child_id: u32,
}

#[derive(Accounts)]
pub struct CancelBreed<'info> {
    #[account(seeds = [GlobalState::SEED], bump = global_state.bump)]
    pub global_state: Account<'info, GlobalState>,

    /// CHECK: rent refund destination for the closed `breed_request`; tied to it via PDA seeds.
    #[account(mut)]
    pub owner: UncheckedAccount<'info>,

    #[account(
        mut,
        close = owner,
        seeds = [BreedRequest::SEED, owner.key().as_ref()],
        bump = breed_request.bump,
        constraint = breed_request.owner == owner.key() @ ErrorCode::Unauthorized,
    )]
    pub breed_request: Account<'info, BreedRequest>,

    /// CHECK: stud-fee escrow PDA for `breed_request.other_owner` (plan §4.4); validated
    /// against the expected PDA address in the handler when `breed_request.stud_fee > 0`.
    /// Unused (any writable account may be passed) for same-owner breeds.
    #[account(mut)]
    pub stud_fee_account: UncheckedAccount<'info>,
}
