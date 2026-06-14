use anchor_lang::prelude::*;
use mpl_core::{
    instructions::UpdatePluginV1CpiBuilder,
    types::{Attributes, Plugin},
};

use crate::{
    metadata::pet_attributes,
    state::{GlobalState, PetAccount},
};

/// Permissionless metadata refresh (plan §2.3/v2.1 Phase A): re-derives this pet's
/// Attributes plugin trait list (Element/Species/Skill/Rarity/Level/Generation) from its
/// current on-chain state and pushes it to the Metaplex Core asset via `UpdatePluginV1`.
/// Anyone may call this -- it only republishes data already public on `pet` (most notably
/// `level`, which changes after `level_up`/battle wins), so there is no authorization
/// check beyond `pet`'s seeds deriving from `asset.key()` (plan §2.3/v2.1 Phase A
/// re-seed). Never called from the battle hot path (plan §2.3); callers refresh on their
/// own schedule.
pub fn handler(ctx: Context<SyncMetadata>) -> Result<()> {
    let pet = &ctx.accounts.pet;
    let global_state = &ctx.accounts.global_state;

    // mpl-core CPI: refresh the Attributes plugin (plan §2.3/v2.1 Phase A). The
    // GlobalState PDA is the asset's update authority (inherited from the collection at
    // mint time, see `settle_mint`/`settle_breed`'s `CreateV1` CPI) and signs this CPI via
    // `invoke_signed`.
    //
    // UNVERIFIED: `UpdatePluginV1CpiBuilder`'s method names/shapes (`asset`/`collection`/
    // `authority`/`payer`/`system_program`/`plugin`/`invoke_signed`) follow the usual
    // mpl-core ~0.10 CPI convention but have not been checked against the real crate (no
    // cargo registry cache or Rust toolchain in this environment). Fix up against
    // `mpl_core::instructions::UpdatePluginV1CpiBuilder` when building.
    let global_state_seeds: &[&[u8]] = &[GlobalState::SEED, &[global_state.bump]];
    UpdatePluginV1CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
        .asset(&ctx.accounts.asset.to_account_info())
        .collection(Some(&ctx.accounts.collection.to_account_info()))
        .authority(Some(&global_state.to_account_info()))
        .payer(&ctx.accounts.payer.to_account_info())
        .system_program(&ctx.accounts.system_program.to_account_info())
        .plugin(Plugin::Attributes(Attributes {
            attribute_list: pet_attributes(pet.dna, pet.species_id, pet.rarity, pet.level, pet.generation),
        }))
        .invoke_signed(&[global_state_seeds])?;

    Ok(())
}

#[derive(Accounts)]
pub struct SyncMetadata<'info> {
    #[account(seeds = [GlobalState::SEED], bump = global_state.bump)]
    pub global_state: Account<'info, GlobalState>,

    /// CHECK: this pet's Metaplex Core asset account; PDA seed for `pet` (plan §2.3/v2.1
    /// Phase A re-seed).
    #[account(mut, owner = mpl_core::ID)]
    pub asset: UncheckedAccount<'info>,

    #[account(
        seeds = [PetAccount::SEED, asset.key().as_ref()],
        bump = pet.bump,
    )]
    pub pet: Account<'info, PetAccount>,

    /// CHECK: address-constrained to the Metaplex Core program; invoked via CPI to update
    /// the Attributes plugin.
    #[account(address = mpl_core::ID)]
    pub mpl_core_program: UncheckedAccount<'info>,

    /// CHECK: the "CryptoPets" collection account (`global_state.collection`).
    #[account(address = global_state.collection)]
    pub collection: UncheckedAccount<'info>,

    /// Pays for any account growth the plugin update requires. Anyone may call
    /// `sync_metadata`, so this is not necessarily `pet.owner`.
    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}
