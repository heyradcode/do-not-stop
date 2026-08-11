use anchor_lang::prelude::*;

/// Equip slots (roadmap §4, mirrors `ItemCore.sol`'s `SLOT_*`).
///
/// Three gear slots and no cosmetic one: cosmetics are out of the v1 catalog, and a slot
/// nothing can go in is a layout decision made for a feature whose shape is undecided.
pub const SLOT_WEAPON: u8 = 0;
pub const SLOT_ARMOR: u8 = 1;
pub const SLOT_TRINKET: u8 = 2;
pub const SLOT_COUNT: usize = 3;

/// How many of one item type a wallet holds.
///
/// One account per (owner, item type), which is the Solana shape of `ItemCore.sol`'s
/// ERC-1155 balance: the item *type* is the key and the quantity is the value, so a catalog
/// of 20 items and one of 2,000 cost the same.
///
/// **Never closed, even at zero.** indexer-go resumes from a watermark, and a deleted
/// account is one it never learns about, so an emptied stack stays as `quantity 0`. Zero is
/// a value, not an absence — the same rule `item_roster` follows off chain.
#[account]
pub struct ItemBalance {
    pub owner: Pubkey,
    pub item_type: u64,
    pub quantity: u64,
    pub version: u8,
    pub bump: u8,
}

impl ItemBalance {
    pub const SEED: &'static [u8] = b"item";
    pub const SPACE: usize = 8 /* discriminator */
        + 32 /* owner */
        + 8 /* item_type */
        + 8 /* quantity */
        + 1 /* version */
        + 1; /* bump */
}

/// Which slot an item type may occupy, or that it is not equipment at all.
///
/// The one piece of catalog data that has to be on chain: without it the program cannot tell
/// a sword from an XP potion, and escrowing a consumable into a weapon slot would lock it
/// where nothing will ever read it. Effects stay off chain, versioned by the battle
/// protocol's `itemCatalogHash`, so a rebalance is not a transaction.
///
/// Stored as `slot + 1` for the same reason `ItemCore` does it: the zero value has to mean
/// "not equippable" rather than "weapon". Read it through [`ItemSlot::slot`].
#[account]
pub struct ItemSlot {
    pub item_type: u64,
    pub slot_plus_one: u8,
    pub version: u8,
    pub bump: u8,
}

impl ItemSlot {
    pub const SEED: &'static [u8] = b"item-slot";
    pub const SPACE: usize = 8 /* discriminator */
        + 8 /* item_type */
        + 1 /* slot_plus_one */
        + 1 /* version */
        + 1; /* bump */

    /// The slot this item occupies, or `None` if it is not equipment.
    pub fn slot(&self) -> Option<u8> {
        if self.slot_plus_one == 0 {
            None
        } else {
            Some(self.slot_plus_one - 1)
        }
    }
}

/// What is equipped on one pet, indexed by slot. `0` means an empty slot.
///
/// Keyed by the pet's Metaplex Core asset rather than its numeric id, because the asset is
/// what ownership is read from on this chain.
///
/// This account *is* the escrow. Equipping decrements the owner's [`ItemBalance`] and writes
/// the type here; there is no separate holding account, unlike ERC-1155's transfer-to-self.
/// The property that matters is the same: the equip record is itself the proof, so "was this
/// gear on this pet at snapshot time" is answered by chain state at a recorded version
/// rather than by a backend row nobody else can check.
#[account]
pub struct PetEquipment {
    pub asset: Pubkey,
    pub slots: [u64; SLOT_COUNT],
    pub version: u8,
    pub bump: u8,
}

impl PetEquipment {
    pub const SEED: &'static [u8] = b"equipment";
    pub const SPACE: usize = 8 /* discriminator */
        + 32 /* asset */
        + 8 * SLOT_COUNT /* slots */
        + 1 /* version */
        + 1; /* bump */

    /// Whether anything is equipped. Drives the freeze that keeps a geared pet in place.
    pub fn any_equipped(&self) -> bool {
        self.slots.iter().any(|item_type| *item_type != 0)
    }
}

/// Permission to mint and burn items, as an account rather than a flag.
///
/// Existence is the permission, so revocation is closing the account and there is no stored
/// boolean to read stale. In practice the holder is the backend's item wallet.
///
/// This is a real trust grant, not a formality, and it is the same one `ItemCore.sol`
/// documents: an authorized caller can burn any wallet's items without that wallet's
/// approval, which is what lets the backend settle a consumable in one call after the player
/// has already authenticated to it. Nothing here constrains that caller; the constraint is
/// who the admin authorizes, so the key belongs nowhere shared.
#[account]
pub struct AuthorizedCaller {
    pub caller: Pubkey,
    pub version: u8,
    pub bump: u8,
}

impl AuthorizedCaller {
    pub const SEED: &'static [u8] = b"authorized";
    pub const SPACE: usize = 8 /* discriminator */
        + 32 /* caller */
        + 1 /* version */
        + 1; /* bump */
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn space_constants_match_their_field_lists() {
        assert_eq!(ItemBalance::SPACE, 8 + 32 + 8 + 8 + 1 + 1);
        assert_eq!(ItemSlot::SPACE, 8 + 8 + 1 + 1 + 1);
        assert_eq!(PetEquipment::SPACE, 8 + 32 + 24 + 1 + 1);
        assert_eq!(AuthorizedCaller::SPACE, 8 + 32 + 1 + 1);
    }

    /// `0` has to mean "not equippable", or an uncatalogued item would read as a weapon.
    #[test]
    fn slot_zero_means_not_equipment() {
        let unset = ItemSlot { item_type: 7, slot_plus_one: 0, version: 1, bump: 0 };
        assert_eq!(unset.slot(), None);
    }

    #[test]
    fn slot_is_stored_one_higher_than_it_reads() {
        for slot in [SLOT_WEAPON, SLOT_ARMOR, SLOT_TRINKET] {
            let entry = ItemSlot { item_type: 1, slot_plus_one: slot + 1, version: 1, bump: 0 };
            assert_eq!(entry.slot(), Some(slot));
        }
    }

    #[test]
    fn any_equipped_reports_each_slot() {
        let mut equipment = PetEquipment { asset: Pubkey::default(), slots: [0; SLOT_COUNT], version: 1, bump: 0 };
        assert!(!equipment.any_equipped());

        for index in 0..SLOT_COUNT {
            equipment.slots = [0; SLOT_COUNT];
            equipment.slots[index] = 42;
            assert!(equipment.any_equipped(), "slot {} must count as equipped", index);
        }
    }

    /// The slot constants index `slots` directly, so they must stay inside it.
    #[test]
    fn every_slot_constant_is_in_range() {
        for slot in [SLOT_WEAPON, SLOT_ARMOR, SLOT_TRINKET] {
            assert!((slot as usize) < SLOT_COUNT);
        }
    }
}
