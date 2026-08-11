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

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    /// Every boundary in the ladder, from both sides. The thresholds are **exclusive**
    /// upper bounds, so a score landing exactly on one belongs to the tier above: 50 is
    /// Uncommon, not Common. Off-by-one here silently reprices the whole gacha, and
    /// `settle_mint` writes the result into a pet that cannot be re-rolled.
    #[test]
    fn from_score_walks_the_thresholds() {
        let cases: &[(u64, Rarity)] = &[
            (0, Rarity::Common),
            (49, Rarity::Common),
            (50, Rarity::Uncommon),
            (74, Rarity::Uncommon),
            (75, Rarity::Rare),
            (89, Rarity::Rare),
            (90, Rarity::Epic),
            (97, Rarity::Epic),
            (98, Rarity::Legendary),
            (99, Rarity::Legendary),
        ];
        for (score, expected) in cases {
            assert_eq!(Rarity::from_score(*score), *expected, "score {}", score);
        }
    }

    /// Scores past the last bound stay Legendary rather than falling through the loop.
    #[test]
    fn from_score_saturates_above_the_ladder() {
        assert_eq!(Rarity::from_score(1_000), Rarity::Legendary);
        assert_eq!(Rarity::from_score(u64::MAX), Rarity::Legendary);
    }

    /// `dna % 100`, matching `Utils.calculateRarity`. Only the last two digits matter, so
    /// a DNA differing only above them must produce the same tier.
    #[test]
    fn from_dna_reads_the_last_two_digits() {
        assert_eq!(Rarity::from_dna(12_345_649), Rarity::Common);
        assert_eq!(Rarity::from_dna(49), Rarity::Common);
        assert_eq!(Rarity::from_dna(98), Rarity::Legendary);
        assert_eq!(Rarity::from_dna(99_999_998), Rarity::Legendary);
    }

    /// The `u8` round trip the account boundary depends on: `PetAccount.rarity` is stored
    /// raw so the IDL stays stable, so a tier that does not survive the trip corrupts a pet.
    #[test]
    fn u8_round_trip_preserves_every_tier() {
        for tier in [
            Rarity::Common,
            Rarity::Uncommon,
            Rarity::Rare,
            Rarity::Epic,
            Rarity::Legendary,
        ] {
            let raw: u8 = tier.into();
            // `.ok()` rather than `.unwrap()`: unwrapping the Err arm would require
            // `ErrorCode: Debug`, which is the error macro's business, not this test's.
            assert_eq!(Rarity::try_from(raw).ok(), Some(tier));
        }
    }

    /// `0` is not a tier: rarity is 1-indexed, and `pool_sizes` is indexed by `rarity - 1`,
    /// so accepting `0` would read the wrong species pool rather than fail.
    #[test]
    fn try_from_rejects_out_of_range_values() {
        for raw in [0u8, 6, 255] {
            assert!(Rarity::try_from(raw).is_err(), "raw {}", raw);
        }
    }
}
