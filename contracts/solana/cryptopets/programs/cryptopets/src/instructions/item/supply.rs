use anchor_lang::prelude::*;

use crate::{
    errors::ErrorCode,
    state::{AuthorizedCaller, GlobalState, ItemBalance, CURRENT_ACCOUNT_VERSION},
};

/// Mints `quantity` of `item_type` to `recipient` (roadmap §4, mirrors `ItemCore.mintTo`).
///
/// The single acquisition path: an admin grant and a claimed battle drop both land here.
/// Crates and marketplace purchases are later features that would call it the same way.
pub fn mint_items(ctx: Context<MintItems>, item_type: u64, quantity: u64) -> Result<()> {
    require!(!ctx.accounts.global_state.paused, ErrorCode::Paused);
    require!(item_type != 0, ErrorCode::ItemTypeReserved);
    require!(quantity > 0, ErrorCode::ZeroQuantity);

    let balance = &mut ctx.accounts.balance;
    balance.owner = ctx.accounts.recipient.key();
    balance.item_type = item_type;
    balance.version = CURRENT_ACCOUNT_VERSION;
    balance.bump = ctx.bumps.balance;
    balance.quantity = balance
        .quantity
        .checked_add(quantity)
        .ok_or(ErrorCode::ArithmeticOverflow)?;

    emit!(ItemsMinted {
        owner: balance.owner,
        item_type,
        quantity,
        balance: balance.quantity,
    });
    Ok(())
}

/// Burns `quantity` of `item_type` from `owner` (roadmap §4, mirrors `ItemCore.burnFrom`).
///
/// Consumables are burned here after the backend has applied their effect, so the burn is
/// the record that the effect was spent. An insufficient balance fails, which is what keeps
/// a double-spend of one potion from settling twice even if the backend asked for it.
///
/// **Equipped copies are unreachable from here, by construction.** Equipping decrements the
/// balance and records the type in `PetEquipment`, so escrowed quantity is not in any
/// `ItemBalance` at all. `ItemCore.sol` needs an explicit `from != address(this)` guard
/// because its escrow is a balance; this program does not, and that is worth stating rather
/// than leaving to be rediscovered. Do not add an "unequip and burn" convenience: burning an
/// equipped item would leave `PetEquipment` naming a type nobody holds, and every snapshot
/// would keep resolving its modifier. The receipt would still verify, because the catalog
/// still declares the item, so the damage would be a phantom combat bonus that passes every
/// check.
pub fn burn_items(ctx: Context<BurnItems>, quantity: u64) -> Result<()> {
    require!(!ctx.accounts.global_state.paused, ErrorCode::Paused);
    require!(quantity > 0, ErrorCode::ZeroQuantity);

    let balance = &mut ctx.accounts.balance;
    balance.quantity = balance
        .quantity
        .checked_sub(quantity)
        .ok_or(ErrorCode::InsufficientItems)?;

    emit!(ItemsBurned {
        owner: balance.owner,
        item_type: balance.item_type,
        quantity,
        balance: balance.quantity,
    });
    Ok(())
}

#[event]
pub struct ItemsMinted {
    pub owner: Pubkey,
    pub item_type: u64,
    pub quantity: u64,
    /// Quantity after the mint, so an indexer needs no prior read to project it.
    pub balance: u64,
}

#[event]
pub struct ItemsBurned {
    pub owner: Pubkey,
    pub item_type: u64,
    pub quantity: u64,
    pub balance: u64,
}

#[derive(Accounts)]
#[instruction(item_type: u64)]
pub struct MintItems<'info> {
    #[account(seeds = [GlobalState::SEED], bump = global_state.bump)]
    pub global_state: Account<'info, GlobalState>,

    /// The backend's item wallet. Pays for the balance account on first mint.
    #[account(mut)]
    pub caller: Signer<'info>,

    /// The signer's authorization. Existing is the permission, so a revoked caller fails to
    /// deserialize it and never reaches the handler.
    #[account(
        seeds = [AuthorizedCaller::SEED, caller.key().as_ref()],
        bump = authorized_caller.bump,
    )]
    pub authorized_caller: Account<'info, AuthorizedCaller>,

    /// CHECK: who receives the items. Any pubkey is valid; only used as a seed.
    pub recipient: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = caller,
        seeds = [ItemBalance::SEED, recipient.key().as_ref(), &item_type.to_le_bytes()],
        bump,
        space = ItemBalance::SPACE,
    )]
    pub balance: Account<'info, ItemBalance>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(item_type: u64)]
pub struct BurnItems<'info> {
    #[account(seeds = [GlobalState::SEED], bump = global_state.bump)]
    pub global_state: Account<'info, GlobalState>,

    pub caller: Signer<'info>,

    #[account(
        seeds = [AuthorizedCaller::SEED, caller.key().as_ref()],
        bump = authorized_caller.bump,
    )]
    pub authorized_caller: Account<'info, AuthorizedCaller>,

    /// CHECK: whose items are burned. Only used as a seed.
    pub owner: UncheckedAccount<'info>,

    /// Not closed at zero, deliberately: the indexer resumes from a watermark and a deleted
    /// account is one it never learns about, so an emptied stack stays as `quantity 0`.
    #[account(
        mut,
        seeds = [ItemBalance::SEED, owner.key().as_ref(), &item_type.to_le_bytes()],
        bump = balance.bump,
    )]
    pub balance: Account<'info, ItemBalance>,
}
