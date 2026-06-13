//! NFT display metadata for Metaplex Core pet assets (plan §2.3/v2.1 Phase A).
//!
//! Builds the Attributes plugin's trait list for a pet: element, species, skill,
//! rarity, level, generation. Refreshed lazily (mint, breed, level-up, or the
//! permissionless `sync_metadata` instruction) -- never in the battle hot path.
//!
//! UNVERIFIED: `mpl_core::types::Attribute`'s field names (`key`/`value`, both
//! `String`, deriving at least `Clone`/`PartialEq`/`Debug`) follow the documented
//! mpl-core Attributes plugin shape but have not been checked against the real
//! crate (no cargo registry cache or Rust toolchain in this environment).

use mpl_core::types::Attribute;

use crate::dna::digit_pair;

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
