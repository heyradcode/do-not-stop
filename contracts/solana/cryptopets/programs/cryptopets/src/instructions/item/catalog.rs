use anchor_lang::prelude::*;

use crate::{
    errors::ErrorCode,
    state::{AuthorizedCaller, GlobalState, ItemSlot, CURRENT_ACCOUNT_VERSION, SLOT_COUNT},
};

/// Declares that `item_type` is equipment for `slot` (roadmap §4, mirrors
/// `ItemCore.registerItemSlot`).
///
/// Admin-gated rather than authorized-caller-gated: this is catalog shape, not gameplay, and
/// it is the one item property the program itself enforces. Re-registering an item type to a
/// different slot is allowed and does not disturb anything already equipped, which stays
/// where it was put until unequipped.
pub fn register_item_slot(ctx: Context<RegisterItemSlot>, item_type: u64, slot: u8) -> Result<()> {
    require!(item_type != 0, ErrorCode::ItemTypeReserved);
    require!((slot as usize) < SLOT_COUNT, ErrorCode::UnknownSlot);

    let entry = &mut ctx.accounts.item_slot;
    entry.item_type = item_type;
    entry.slot_plus_one = slot + 1;
    entry.version = CURRENT_ACCOUNT_VERSION;
    entry.bump = ctx.bumps.item_slot;

    emit!(ItemSlotRegistered { item_type, slot });
    Ok(())
}

/// Stops treating `item_type` as equipment.
///
/// Already-equipped copies are not disturbed; they simply cannot be re-equipped after being
/// removed. The account is zeroed rather than closed, so `slot()` reads `None` and the
/// indexer sees the change instead of an account that quietly vanished.
pub fn clear_item_slot(ctx: Context<ClearItemSlot>) -> Result<()> {
    let entry = &mut ctx.accounts.item_slot;
    entry.slot_plus_one = 0;

    emit!(ItemSlotCleared { item_type: entry.item_type });
    Ok(())
}

/// Grants permission to mint and burn items by creating the caller's PDA.
pub fn authorize_caller(ctx: Context<AuthorizeCaller>) -> Result<()> {
    let record = &mut ctx.accounts.authorized_caller;
    record.caller = ctx.accounts.caller.key();
    record.version = CURRENT_ACCOUNT_VERSION;
    record.bump = ctx.bumps.authorized_caller;

    emit!(CallerAuthorized { caller: record.caller });
    Ok(())
}

/// Revokes it by closing the PDA, refunding rent to the admin.
pub fn revoke_caller(ctx: Context<RevokeCaller>) -> Result<()> {
    emit!(CallerRevoked { caller: ctx.accounts.authorized_caller.caller });
    Ok(())
}

#[event]
pub struct ItemSlotRegistered {
    pub item_type: u64,
    pub slot: u8,
}

#[event]
pub struct ItemSlotCleared {
    pub item_type: u64,
}

#[event]
pub struct CallerAuthorized {
    pub caller: Pubkey,
}

#[event]
pub struct CallerRevoked {
    pub caller: Pubkey,
}

#[derive(Accounts)]
#[instruction(item_type: u64)]
pub struct RegisterItemSlot<'info> {
    #[account(
        seeds = [GlobalState::SEED],
        bump = global_state.bump,
        has_one = admin @ ErrorCode::Unauthorized,
    )]
    pub global_state: Account<'info, GlobalState>,

    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init_if_needed,
        payer = admin,
        seeds = [ItemSlot::SEED, &item_type.to_le_bytes()],
        bump,
        space = ItemSlot::SPACE,
    )]
    pub item_slot: Account<'info, ItemSlot>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(item_type: u64)]
pub struct ClearItemSlot<'info> {
    #[account(
        seeds = [GlobalState::SEED],
        bump = global_state.bump,
        has_one = admin @ ErrorCode::Unauthorized,
    )]
    pub global_state: Account<'info, GlobalState>,

    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [ItemSlot::SEED, &item_type.to_le_bytes()],
        bump = item_slot.bump,
    )]
    pub item_slot: Account<'info, ItemSlot>,
}

#[derive(Accounts)]
pub struct AuthorizeCaller<'info> {
    #[account(
        seeds = [GlobalState::SEED],
        bump = global_state.bump,
        has_one = admin @ ErrorCode::Unauthorized,
    )]
    pub global_state: Account<'info, GlobalState>,

    #[account(mut)]
    pub admin: Signer<'info>,

    /// CHECK: the wallet being authorized. Only used as a seed.
    pub caller: UncheckedAccount<'info>,

    #[account(
        init,
        payer = admin,
        seeds = [AuthorizedCaller::SEED, caller.key().as_ref()],
        bump,
        space = AuthorizedCaller::SPACE,
    )]
    pub authorized_caller: Account<'info, AuthorizedCaller>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevokeCaller<'info> {
    #[account(
        seeds = [GlobalState::SEED],
        bump = global_state.bump,
        has_one = admin @ ErrorCode::Unauthorized,
    )]
    pub global_state: Account<'info, GlobalState>,

    #[account(mut)]
    pub admin: Signer<'info>,

    /// CHECK: the wallet being revoked. Only used as a seed.
    pub caller: UncheckedAccount<'info>,

    #[account(
        mut,
        close = admin,
        seeds = [AuthorizedCaller::SEED, caller.key().as_ref()],
        bump = authorized_caller.bump,
    )]
    pub authorized_caller: Account<'info, AuthorizedCaller>,
}
