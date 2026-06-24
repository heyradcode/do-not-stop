use anchor_lang::prelude::*;
use mpl_core::instructions::TransferV1CpiBuilder;

use crate::{
    errors::ErrorCode,
    state::{GlobalState, PetAccount},
    utils::metadata::core_asset_owner,
};

/// Transfer a pet to another wallet. Pets are Metaplex Core assets and the asset is the
/// source of truth for ownership (plan §2.3/v2.1 Phase A), so this CPIs mpl-core
/// `TransferV1` to move the asset and then updates the denormalized `pet.owner` snapshot so
/// owner-filtered queries (the gallery's `getProgramAccounts` memcmp on `owner`) keep
/// finding the pet under its new owner.
///
/// A married pet is refused: the spouse's `PetAccount` cross-references this pet (and its
/// `marriage_owner_snapshot` drives cross-owner breeding), so it must be divorced first.
pub fn handler(ctx: Context<TransferPet>) -> Result<()> {
    require!(!ctx.accounts.global_state.paused, ErrorCode::Paused);

    // Only the current (live) asset owner may transfer. mpl-core re-checks this in the CPI;
    // we assert it up front for a clean error and to gate the `pet.owner` write below.
    require_keys_eq!(
        core_asset_owner(&ctx.accounts.pet_asset.to_account_info())?,
        ctx.accounts.owner.key(),
        ErrorCode::Unauthorized
    );

    require!(
        ctx.accounts.pet.spouse_id == 0,
        ErrorCode::CannotTransferMarriedPet
    );

    // mpl-core CPI: move the Core asset to `new_owner`. The asset's owner is the transfer
    // authority and signs the outer transaction, so this is `invoke()` (no PDA seeds). The
    // collection must be supplied for collection-scoped assets; it is not mutated here.
    TransferV1CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
        .asset(&ctx.accounts.pet_asset.to_account_info())
        .collection(Some(&ctx.accounts.collection.to_account_info()))
        .payer(&ctx.accounts.owner.to_account_info())
        .authority(Some(&ctx.accounts.owner.to_account_info()))
        .new_owner(&ctx.accounts.new_owner.to_account_info())
        .system_program(Some(&ctx.accounts.system_program.to_account_info()))
        .invoke()?;

    // Keep the cached owner in sync with the asset's new owner.
    ctx.accounts.pet.owner = ctx.accounts.new_owner.key();

    Ok(())
}

#[derive(Accounts)]
pub struct TransferPet<'info> {
    #[account(seeds = [GlobalState::SEED], bump = global_state.bump)]
    pub global_state: Account<'info, GlobalState>,

    /// CHECK: this pet's Metaplex Core asset account; PDA seed for `pet` and source of
    /// truth for ownership (plan §2.3/v2.1 Phase A). Mutated by the `TransferV1` CPI.
    #[account(mut, owner = mpl_core::ID)]
    pub pet_asset: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [PetAccount::SEED, pet_asset.key().as_ref()],
        bump = pet.bump,
    )]
    pub pet: Account<'info, PetAccount>,

    /// CHECK: the "CryptoPets" collection account (`global_state.collection`); supplied to
    /// the `TransferV1` CPI to validate collection membership. Not mutated.
    #[account(address = global_state.collection)]
    pub collection: UncheckedAccount<'info>,

    /// CHECK: recipient wallet that receives the Core asset. Any pubkey is valid.
    pub new_owner: UncheckedAccount<'info>,

    #[account(mut)]
    pub owner: Signer<'info>,

    /// CHECK: address-constrained to the Metaplex Core program; invoked via CPI.
    #[account(address = mpl_core::ID)]
    pub mpl_core_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}
