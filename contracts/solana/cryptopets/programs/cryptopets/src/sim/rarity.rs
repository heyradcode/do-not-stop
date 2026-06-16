use crate::errors::ErrorCode;

/// Pet rarity tier.
///
/// Stored on [`crate::state::PetAccount`] as a raw `u8` so the IDL stays stable; convert at
/// the account boundary with [`From`] / [`TryFrom`].
#[repr(u8)]
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Rarity {
    Common = 1,
    Uncommon = 2,
    Rare = 3,
    Epic = 4,
    Legendary = 5,
}

impl Rarity {
    /// Score ladder mirroring `Utils.calculateRarity` from the Ethereum CryptoPets contracts.
    /// Each entry is the **exclusive** upper bound; scores ≥ the last bound are Legendary.
    const THRESHOLDS: &'static [(u64, Rarity)] = &[
        (50, Rarity::Common),
        (75, Rarity::Uncommon),
        (90, Rarity::Rare),
        (98, Rarity::Epic),
    ];

    pub fn from_score(score: u64) -> Self {
        for (max_exclusive, tier) in Self::THRESHOLDS {
            if score < *max_exclusive {
                return *tier;
            }
        }
        Rarity::Legendary
    }

    /// `dna % 100` → tier (same formula as `Utils.calculateRarity`).
    pub fn from_dna(dna: u64) -> Self {
        Self::from_score(dna % 100)
    }
}

impl From<Rarity> for u8 {
    fn from(rarity: Rarity) -> u8 {
        rarity as u8
    }
}

impl TryFrom<u8> for Rarity {
    type Error = ErrorCode;

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            1 => Ok(Rarity::Common),
            2 => Ok(Rarity::Uncommon),
            3 => Ok(Rarity::Rare),
            4 => Ok(Rarity::Epic),
            5 => Ok(Rarity::Legendary),
            _ => Err(ErrorCode::InvalidRarity),
        }
    }
}
