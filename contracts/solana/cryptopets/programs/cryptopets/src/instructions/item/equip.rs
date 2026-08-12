use anchor_lang::prelude::*;
use mpl_core::{
    instructions::{AddPluginV1CpiBuilder, RemovePluginV1CpiBuilder, UpdatePluginV1CpiBuilder},
    types::{FreezeDelegate, Plugin, PluginAuthority, PluginType},
};

use crate::{
    errors::ErrorCode,
    state::{
        GlobalState, ItemBalance, ItemSlot, PetAccount, PetEquipment, CURRENT_ACCOUNT_VERSION,
        SLOT_COUNT,
    },
    utils::metadata::core_asset_owner,
};

/// Equipping and unequipping (roadmap §4, mirrors `ItemCore.equip` / `ItemCore.unequip`).
///
/// **The freeze is the load-bearing part.** On EVM,
/// `PetCore._beforeTokenTransfer` refuses to move a pet with any slot filled, which is what
/// stops gear silently changing hands with the pet. Solana has no equivalent hook: a holder
/// can transfer a Metaplex Core asset straight through `mpl-core` without this program ever
/// running, so an in-program check in `transfer_pet` is not the same guarantee. Freezing the
/// asset while it is geared is, because the freeze lives on the asset itself and mpl-core
/// enforces it on every transfer path.
///
/// So do not remove the freeze CPIs below on the grounds that `transfer_pet` already checks.
/// That check is for a readable error; this is the enforcement.
///
/// UNVERIFIED: the `mpl_core` plugin builders and types here follow the documented
/// mpl-core ~0.10 API but have not been checked against the real crate (no Rust toolchain in
/// this environment), matching the caveat on `core_asset_owner`. Confirm
/// `AddPluginV1CpiBuilder` / `UpdatePluginV1CpiBuilder` / `RemovePluginV1CpiBuilder` and the
/// `FreezeDelegate` shape when building.

/// Escrows one `item_type` onto `pet` in `slot`.
///
/// Escrow, not a transfer lock, and unlike ERC-1155 there is no holding account: the
/// quantity leaves the owner's [`ItemBalance`] and the type is written into
/// [`PetEquipment`], which *is* the record. That buys the same two things `ItemCore` cites.
/// The equip record is itself the ownership proof, so "was this gear on this pet at snapshot
/// time" is answered by chain state at a recorded version rather than by a backend row
/// nobody else can check. And one copy of an item cannot buff two pets, without needing a
/// locked-balance invariant that breaks the moment a geared pet changes hands.
pub fn equip(ctx: Context<Equip>, slot: u8, item_type: u64) -> Result<()> {
    require!(!ctx.accounts.global_state.paused, ErrorCode::Paused);
    require!((slot as usize) < SLOT_COUNT, ErrorCode::UnknownSlot);

    // The asset is the source of truth for ownership, not `pet.owner`, which is a cache a
    // direct Core transfer leaves stale. The backend physically cannot equip: that is what
    // makes gear in a battle snapshot checkable against chain state by someone who does not
    // trust the operator, rather than an assertion by it.
    require_keys_eq!(
        core_asset_owner(&ctx.accounts.pet_asset.to_account_info())?,
        ctx.accounts.owner.key(),
        ErrorCode::Unauthorized
    );

    let declared = ctx.accounts.item_slot.slot().ok_or(ErrorCode::NotEquippable)?;
    require!(declared == slot, ErrorCode::WrongSlot);
    require!(
        ctx.accounts.item_slot.item_type == item_type,
        ErrorCode::NotEquippable
    );

    let equipment = &mut ctx.accounts.equipment;
    equipment.asset = ctx.accounts.pet_asset.key();
    equipment.version = CURRENT_ACCOUNT_VERSION;
    equipment.bump = ctx.bumps.equipment;
    require!(
        equipment.slots[slot as usize] == 0,
        ErrorCode::SlotAlreadyFilled
    );

    let was_bare = !equipment.any_equipped();

    let balance = &mut ctx.accounts.balance;
    balance.quantity = balance
        .quantity
        .checked_sub(1)
        .ok_or(ErrorCode::InsufficientItems)?;

    equipment.slots[slot as usize] = item_type;

    // Only on the first item: adding a plugin the asset already carries fails.
    if was_bare {
        let global_state_seeds: &[&[u8]] = &[GlobalState::SEED, &[ctx.accounts.global_state.bump]];
        AddPluginV1CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
            .asset(&ctx.accounts.pet_asset.to_account_info())
            .collection(Some(&ctx.accounts.collection.to_account_info()))
            .payer(&ctx.accounts.owner.to_account_info())
            .authority(Some(&ctx.accounts.global_state.to_account_info()))
            .system_program(&ctx.accounts.system_program.to_account_info())
            .plugin(Plugin::FreezeDelegate(FreezeDelegate { frozen: true }))
            .init_authority(PluginAuthority::UpdateAuthority)
            .invoke_signed(&[global_state_seeds])?;
    }

    emit!(ItemEquipped {
        asset: equipment.asset,
        pet_id: ctx.accounts.pet.id,
        slot,
        item_type,
        owner: ctx.accounts.owner.key(),
    });
    Ok(())
}

/// Returns the item in `slot` to the pet's current owner.
///
/// Pays the current owner rather than whoever equipped it, the same rule `ItemCore.unequip`
/// applies: it is what stops an item being stranded behind a pet its equipper can no longer
/// reach. Here that is automatic, since only the current owner may call this at all.
pub fn unequip(ctx: Context<Unequip>, slot: u8) -> Result<()> {
    require!(!ctx.accounts.global_state.paused, ErrorCode::Paused);
    require!((slot as usize) < SLOT_COUNT, ErrorCode::UnknownSlot);

    require_keys_eq!(
        core_asset_owner(&ctx.accounts.pet_asset.to_account_info())?,
        ctx.accounts.owner.key(),
        ErrorCode::Unauthorized
    );

    let equipment = &mut ctx.accounts.equipment;
    let item_type = equipment.slots[slot as usize];
    require!(item_type != 0, ErrorCode::SlotEmpty);
    require!(
        ctx.accounts.balance.item_type == item_type,
        ErrorCode::NotEquippable
    );

    equipment.slots[slot as usize] = 0;

    let balance = &mut ctx.accounts.balance;
    balance.owner = ctx.accounts.owner.key();
    balance.item_type = item_type;
    balance.version = CURRENT_ACCOUNT_VERSION;
    balance.bump = ctx.bumps.balance;
    balance.quantity = balance
        .quantity
        .checked_add(1)
        .ok_or(ErrorCode::ArithmeticOverflow)?;

    // Only once nothing is left: a pet with one slot still filled stays frozen.
    //
    // Two CPIs, in this order, and the order is not optional. mpl-core refuses to remove a
    // FreezeDelegate while it is frozen, which is the whole point of a freeze, so it has to
    // be thawed first. Removing it rather than leaving it thawed returns the asset to a
    // clean state, so the next equip's Add succeeds instead of failing on a plugin that is
    // already there.
    if !equipment.any_equipped() {
        let global_state_seeds: &[&[u8]] = &[GlobalState::SEED, &[ctx.accounts.global_state.bump]];

        UpdatePluginV1CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
            .asset(&ctx.accounts.pet_asset.to_account_info())
            .collection(Some(&ctx.accounts.collection.to_account_info()))
            .payer(&ctx.accounts.owner.to_account_info())
            .authority(Some(&ctx.accounts.global_state.to_account_info()))
            .system_program(&ctx.accounts.system_program.to_account_info())
            .plugin(Plugin::FreezeDelegate(FreezeDelegate { frozen: false }))
            .invoke_signed(&[global_state_seeds])?;

        RemovePluginV1CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
            .asset(&ctx.accounts.pet_asset.to_account_info())
            .collection(Some(&ctx.accounts.collection.to_account_info()))
            .payer(&ctx.accounts.owner.to_account_info())
            .authority(Some(&ctx.accounts.global_state.to_account_info()))
            .system_program(&ctx.accounts.system_program.to_account_info())
            .plugin_type(PluginType::FreezeDelegate)
            .invoke_signed(&[global_state_seeds])?;
    }

    emit!(ItemUnequipped {
        asset: equipment.asset,
        pet_id: ctx.accounts.pet.id,
        slot,
        item_type,
        owner: ctx.accounts.owner.key(),
    });
    Ok(())
}

#[event]
pub struct ItemEquipped {
    pub asset: Pubkey,
    pub pet_id: u32,
    pub slot: u8,
    pub item_type: u64,
    pub owner: Pubkey,
}

#[event]
pub struct ItemUnequipped {
    pub asset: Pubkey,
    pub pet_id: u32,
    pub slot: u8,
    pub item_type: u64,
    pub owner: Pubkey,
}

#[derive(Accounts)]
#[instruction(slot: u8, item_type: u64)]
pub struct Equip<'info> {
    #[account(seeds = [GlobalState::SEED], bump = global_state.bump)]
    pub global_state: Account<'info, GlobalState>,

    #[account(mut)]
    pub owner: Signer<'info>,

    /// CHECK: this pet's Metaplex Core asset; PDA seed for `pet` and the source of truth for
    /// ownership. Mutated by the plugin CPIs.
    #[account(mut, owner = mpl_core::ID)]
    pub pet_asset: UncheckedAccount<'info>,

    #[account(
        seeds = [PetAccount::SEED, pet_asset.key().as_ref()],
        bump = pet.bump,
    )]
    pub pet: Account<'info, PetAccount>,

    /// CHECK: the "CryptoPets" collection; supplied to the plugin CPIs to validate
    /// membership. Not mutated.
    #[account(address = global_state.collection)]
    pub collection: UncheckedAccount<'info>,

    /// Created on this pet's first equip.
    #[account(
        init_if_needed,
        payer = owner,
        seeds = [PetEquipment::SEED, pet_asset.key().as_ref()],
        bump,
        space = PetEquipment::SPACE,
    )]
    pub equipment: Account<'info, PetEquipment>,

    /// The catalog entry saying this item is equipment, and for which slot.
    #[account(
        seeds = [ItemSlot::SEED, &item_type.to_le_bytes()],
        bump = item_slot.bump,
    )]
    pub item_slot: Account<'info, ItemSlot>,

    #[account(
        mut,
        seeds = [ItemBalance::SEED, owner.key().as_ref(), &item_type.to_le_bytes()],
        bump = balance.bump,
    )]
    pub balance: Account<'info, ItemBalance>,

    /// CHECK: address-constrained to the Metaplex Core program; invoked via CPI.
    #[account(address = mpl_core::ID)]
    pub mpl_core_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(slot: u8, item_type: u64)]
pub struct Unequip<'info> {
    #[account(seeds = [GlobalState::SEED], bump = global_state.bump)]
    pub global_state: Account<'info, GlobalState>,

    #[account(mut)]
    pub owner: Signer<'info>,

    /// CHECK: as in `Equip`.
    #[account(mut, owner = mpl_core::ID)]
    pub pet_asset: UncheckedAccount<'info>,

    #[account(
        seeds = [PetAccount::SEED, pet_asset.key().as_ref()],
        bump = pet.bump,
    )]
    pub pet: Account<'info, PetAccount>,

    /// CHECK: as in `Equip`.
    #[account(address = global_state.collection)]
    pub collection: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [PetEquipment::SEED, pet_asset.key().as_ref()],
        bump = equipment.bump,
    )]
    pub equipment: Account<'info, PetEquipment>,

    /// `init_if_needed` because the owner may have spent every loose copy while this one was
    /// equipped, leaving no balance account to return it to.
    #[account(
        init_if_needed,
        payer = owner,
        seeds = [ItemBalance::SEED, owner.key().as_ref(), &item_type.to_le_bytes()],
        bump,
        space = ItemBalance::SPACE,
    )]
    pub balance: Account<'info, ItemBalance>,

    /// CHECK: address-constrained to the Metaplex Core program; invoked via CPI.
    #[account(address = mpl_core::ID)]
    pub mpl_core_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}
