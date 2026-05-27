/// Folds the given byte slices into a `u64` via a splitmix64-style mixing function.
///
/// Solana programs cannot access verifiable randomness without an oracle (e.g. Switchboard
/// or VRF). This helper mirrors the spirit of Ethereum's `randMod` in `Utils.sol`: a
/// deterministic mix over caller-tied inputs so outcomes vary across invocations. It is
/// dependency-free (no `solana_program::hash`) and does **not** provide cryptographic
/// guarantees — do not use for high-stakes randomness.
pub fn pseudo_random(seeds: &[&[u8]]) -> u64 {
    let mut x: u64 = 0x9E37_79B9_7F4A_7C15; // golden-ratio constant used by splitmix64

    for s in seeds {
        for &b in *s {
            x ^= b as u64;
            x = x.wrapping_mul(0xBF58_476D_1CE4_E5B9);
            x ^= x >> 30;
        }
    }

    x ^= x >> 27;
    x = x.wrapping_mul(0x94D0_49BB_1331_11EB);
    x ^= x >> 31;
    x
}

/// Pet rarity tier.
///
/// The on-chain account stores rarity as a raw `u8` (see `PetAccount::rarity`) so the IDL and
/// off-chain decoders stay stable; this enum is the in-program source of truth that handlers
/// convert to/from at the storage boundary via [`Rarity::as_u8`] / [`Rarity::try_from_u8`].
#[repr(u8)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Rarity {
    Common = 1,
    Uncommon = 2,
    Rare = 3,
    Epic = 4,
    Legendary = 5,
}

impl Rarity {
    /// Score ladder mirroring `Utils.calculateRarity` from the Ethereum CryptoPets contracts.
    /// Scores are taken modulo 100; each tier's entry is the **exclusive** upper bound, in
    /// ascending order. Anything ≥ the last threshold falls into [`Rarity::Legendary`].
    const THRESHOLDS: &'static [(u64, Rarity)] = &[
        (50, Rarity::Common),
        (75, Rarity::Uncommon),
        (90, Rarity::Rare),
        (98, Rarity::Epic),
    ];

    pub const fn as_u8(self) -> u8 {
        self as u8
    }

    pub fn try_from_u8(value: u8) -> Option<Self> {
        match value {
            1 => Some(Rarity::Common),
            2 => Some(Rarity::Uncommon),
            3 => Some(Rarity::Rare),
            4 => Some(Rarity::Epic),
            5 => Some(Rarity::Legendary),
            _ => None,
        }
    }

    pub fn from_score(score: u64) -> Self {
        for (max_exclusive, tier) in Self::THRESHOLDS {
            if score < *max_exclusive {
                return *tier;
            }
        }
        Rarity::Legendary
    }
}

/// Mirrors `Utils.calculateRarity` from the Ethereum CryptoPets contracts.
pub fn calculate_rarity(dna: u64) -> Rarity {
    Rarity::from_score(dna % 100)
}
