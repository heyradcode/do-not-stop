use anchor_lang::{prelude::*, solana_program::keccak};
use switchboard_on_demand::RandomnessAccountData;

use crate::{errors::ErrorCode, rarity::Rarity};

/// Mirrors Ethereum `Utils.mixDnaWithVrfWord`: derive child DNA from VRF bytes + parents.
/// Randomness comes entirely from Switchboard; parents only bias the mix.
pub fn mix_dna_with_vrf(vrf: &[u8; 32], parent1_dna: u64, parent2_dna: u64) -> u64 {
    let mut x = u64::from_le_bytes(vrf[0..8].try_into().unwrap());
    x ^= u64::from_le_bytes(vrf[8..16].try_into().unwrap());
    x ^= u64::from_le_bytes(vrf[16..24].try_into().unwrap());
    x ^= u64::from_le_bytes(vrf[24..32].try_into().unwrap());
    x ^= parent1_dna.wrapping_mul(0x9E37_79B9_7F4A_7C15);
    x ^= parent2_dna.wrapping_mul(0xC2B2_AE3D_27D4_EB4F);
    x
}

/// Rarity inheritance (plan §4.2, mirrors EVM `GameLogicV1._inheritRarity`): recompute the
/// base rarity from the child's DNA, then — if both parents are Epic+ (rarity >= 4) and the
/// base rarity isn't already Legendary — roll a 5% chance, derived from the VRF seed, to
/// bump it by one tier.
pub fn inherit_rarity(parent1_rarity: u8, parent2_rarity: u8, child_dna: u64, vrf: &[u8; 32]) -> u8 {
    let base: u8 = Rarity::from_dna(child_dna).into();
    if parent1_rarity >= 4 && parent2_rarity >= 4 && base < 5 {
        let digest = keccak::hashv(&[vrf, b"rarity"]).to_bytes();
        let bump_roll = u64::from_le_bytes(digest[0..8].try_into().unwrap()) % 100;
        if bump_roll < 5 {
            return base + 1;
        }
    }
    base
}

/// Commit-phase checks: `commitIx` and the program instruction must share a transaction so
/// `seed_slot == clock.slot - 1`.
pub fn assert_randomness_committed(
    randomness_account: &AccountInfo,
    randomness_pubkey: Pubkey,
) -> Result<u64> {
    require_keys_eq!(
        randomness_account.key(),
        randomness_pubkey,
        ErrorCode::InvalidRandomnessAccount
    );

    let clock = Clock::get()?;
    let data = RandomnessAccountData::parse(randomness_account.data.borrow())
        .map_err(|_| error!(ErrorCode::InvalidRandomnessAccount))?;

    let prev_slot = clock
        .slot
        .checked_sub(1)
        .ok_or(error!(ErrorCode::RandomnessExpired))?;
    require!(
        data.seed_slot == prev_slot,
        ErrorCode::RandomnessExpired
    );
    require!(
        data.get_value(clock.slot).is_err(),
        ErrorCode::RandomnessAlreadyRevealed
    );

    Ok(data.seed_slot)
}

/// Reveal-phase checks: `revealIx` and the program instruction must share a transaction.
pub fn read_revealed_randomness(
    randomness_account: &AccountInfo,
    randomness_pubkey: Pubkey,
    commit_slot: u64,
) -> Result<[u8; 32]> {
    require_keys_eq!(
        randomness_account.key(),
        randomness_pubkey,
        ErrorCode::InvalidRandomnessAccount
    );

    let clock = Clock::get()?;
    let data = RandomnessAccountData::parse(randomness_account.data.borrow())
        .map_err(|_| error!(ErrorCode::InvalidRandomnessAccount))?;

    require!(
        data.seed_slot == commit_slot,
        ErrorCode::RandomnessExpired
    );

    data.get_value(clock.slot)
        .map_err(|_| error!(ErrorCode::RandomnessNotResolved))
}

// NOTE: not run — no Rust toolchain (cargo/anchor) available in this environment.
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn inherit_rarity_ignores_vrf_when_a_parent_is_below_epic() {
        // dna % 100 == 1 -> base rarity Common (1). With one parent below Epic (rarity < 4),
        // the bump path never triggers regardless of the VRF bytes.
        let child_dna = 1u64;
        let vrf = [0xFFu8; 32];
        assert_eq!(inherit_rarity(3, 5, child_dna, &vrf), 1);
        assert_eq!(inherit_rarity(5, 3, child_dna, &vrf), 1);
    }

    #[test]
    fn inherit_rarity_never_exceeds_legendary() {
        // dna % 100 == 98 -> base rarity is already Legendary (5), so the bump is skipped
        // even with both parents Epic+.
        let child_dna = 98u64;
        let vrf = [0xFFu8; 32];
        assert_eq!(inherit_rarity(5, 5, child_dna, &vrf), 5);
    }

    #[test]
    fn inherit_rarity_bump_stays_within_one_tier_when_eligible() {
        // dna % 100 == 1 -> base rarity Common (1). With both parents Epic+, the result is
        // either the base tier (no bump) or exactly one tier higher (5% bump), never more.
        let child_dna = 1u64;
        for seed_byte in 0u8..=255 {
            let vrf = [seed_byte; 32];
            let result = inherit_rarity(4, 4, child_dna, &vrf);
            assert!(result == 1 || result == 2, "unexpected rarity {result}");
        }
    }
}
