//! Metaplex Core helpers for the CryptoPets collection (plan §2.3/v2.1 Phase A).
//!
//! - [`pet_attributes`] — builds the Attributes plugin's trait list for a pet (element,
//!   species, skill, rarity, level, generation). Refreshed lazily at mint, breed,
//!   level-up, or via the permissionless `sync_metadata` instruction.
//! - [`core_asset_owner`] — reads a Core asset's current `owner` from its account data;
//!   this is the authoritative source of pet ownership post-mint, replacing `pet.owner`.
//!
//! UNVERIFIED: `mpl_core` type and function shapes follow the documented mpl-core ~0.10
//! API but have not been checked against the real crate (no cargo registry cache or Rust
//! toolchain in this environment). Fix up against actual crate when building.

use anchor_lang::prelude::*;
use mpl_core::types::Attribute;

use crate::{errors::ErrorCode, sim::dna::digit_pair};

/// Builds the display-attribute list for a pet's Metaplex Core Attributes plugin.
/// `skill` is `species_id % 8` (plan §3.7); `element` is derived from `dna`'s first
/// digit pair (plan §3.1/§3.2), independent of level/rarity.
pub fn pet_attributes(dna: u64, species_id: u16, rarity: u8, level: u16, generation: u8) -> Vec<Attribute> {
    let element = digit_pair(dna, 0) % 6;
    let skill = species_id % 8;

    vec![
        Attribute {
            key: "Element".to_string(),
            value: element.to_string(),
        },
        Attribute {
            key: "Species".to_string(),
            value: species_id.to_string(),
        },
        Attribute {
            key: "Skill".to_string(),
            value: skill.to_string(),
        },
        Attribute {
            key: "Rarity".to_string(),
            value: rarity.to_string(),
        },
        Attribute {
            key: "Level".to_string(),
            value: level.to_string(),
        },
        Attribute {
            key: "Generation".to_string(),
            value: generation.to_string(),
        },
    ]
}

// ─── Asset ownership ──────────────────────────────────────────────────────────

/// Reads the current owner of a pet's Metaplex Core asset directly from its account data
/// (plan §2.3/v2.1 Phase A re-seed). This is the source of truth for pet ownership,
/// replacing `PetAccount.owner` (informational-only post-mint, see its doc comment).
///
/// UNVERIFIED: `mpl_core::accounts::BaseAssetV1::from_bytes` and its `owner: Pubkey`
/// field follow the documented mpl-core ~0.10 `BaseAssetV1` account layout (`key`,
/// `owner`, `update_authority`, `name`, `uri`, followed by plugin data) but have not been
/// checked against the real crate (no cargo registry cache or Rust toolchain in this
/// environment). Fix up against `mpl_core::accounts::BaseAssetV1` when building.
pub fn core_asset_owner(asset_account: &AccountInfo) -> Result<Pubkey> {
    let data = asset_account.try_borrow_data()?;
    let asset = mpl_core::accounts::BaseAssetV1::from_bytes(&data)
        .map_err(|_| error!(ErrorCode::InvalidPetAsset))?;
    Ok(asset.owner)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

// NOTE: not run -- no Rust toolchain (cargo/anchor) available in this environment.
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pet_attributes_derives_element_and_skill_from_dna_and_species() {
        // digit_pair(7, 0) == 7 -> element = 7 % 6 = 1
        let attrs = pet_attributes(7, 11, 3, 5, 2);
        assert_eq!(
            attrs[0],
            Attribute {
                key: "Element".to_string(),
                value: "1".to_string(),
            }
        );
        assert_eq!(
            attrs[1],
            Attribute {
                key: "Species".to_string(),
                value: "11".to_string(),
            }
        );
        // skill = 11 % 8 = 3
        assert_eq!(
            attrs[2],
            Attribute {
                key: "Skill".to_string(),
                value: "3".to_string(),
            }
        );
        assert_eq!(
            attrs[3],
            Attribute {
                key: "Rarity".to_string(),
                value: "3".to_string(),
            }
        );
        assert_eq!(
            attrs[4],
            Attribute {
                key: "Level".to_string(),
                value: "5".to_string(),
            }
        );
        assert_eq!(
            attrs[5],
            Attribute {
                key: "Generation".to_string(),
                value: "2".to_string(),
            }
        );
    }
}
