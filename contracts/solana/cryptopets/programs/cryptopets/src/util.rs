use anchor_lang::{prelude::*, solana_program::keccak};
use switchboard_on_demand::RandomnessAccountData;

use crate::{dna::digit_pair, errors::ErrorCode, rarity::Rarity};

/// Gene mixing with mutation (plan §4.2, mirrors EVM `GameLogicV1._mixDna`'s per-digit-pair
/// 45%/45%/10% inheritance). For each of the 8 two-digit pairs (LSB-first, see `dna::digit_pair`):
/// - 10%: mutation — a fresh value derived from the VRF bytes, always in `0..=9` (mirrors
///   EVM reusing `pairRand % 100` for both the pick roll and the mutated pair, which is
///   only ever `< 10` in that branch)
/// - 45%: inherit parent 1's pair at this index
/// - 45%: inherit parent 2's pair at this index
///
/// Bit-identical cross-chain parity isn't possible (Switchboard vs. Chainlink VRF produce
/// different byte streams), but the mixing algorithm itself mirrors EVM's `_mixDna`.
pub fn mix_dna_with_vrf(vrf: &[u8; 32], parent1_dna: u64, parent2_dna: u64) -> u64 {
    let mut child: u64 = 0;
    for i in 0..8u32 {
        let digest = keccak::hashv(&[vrf, &i.to_le_bytes()]).to_bytes();
        let pair_rand = u64::from_le_bytes(digest[0..8].try_into().unwrap());
        let pick = pair_rand % 100;
        let pair = if pick < 10 {
            pair_rand % 100 // 10% mutation, always < 10 (== pick)
        } else if pick < 55 {
            digit_pair(parent1_dna, i) // 45% parent 1
        } else {
            digit_pair(parent2_dna, i) // 45% parent 2
        };
        child += pair * 100u64.pow(i);
    }
    child
}

/// Gacha mint DNA (plan §4.3): derived purely from the revealed VRF value, with no parent
/// influence (unlike [`mix_dna_with_vrf`]). Domain-separated from other VRF derivations
/// (e.g. [`inherit_rarity`]'s `b"rarity"` roll) via the `b"mint"` tag.
pub fn mint_dna_from_vrf(vrf: &[u8; 32]) -> u64 {
    let digest = keccak::hashv(&[vrf, b"mint"]).to_bytes();
    u64::from_le_bytes(digest[0..8].try_into().unwrap())
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

// NOTE: not run — no Rust toolchain (cargo/anchor) available in this environment.
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mix_dna_with_vrf_is_deterministic() {
        let vrf = [0x42u8; 32];
        assert_eq!(
            mix_dna_with_vrf(&vrf, 12_34_56_78_90_12_34, 98_76_54_32_10_98_76),
            mix_dna_with_vrf(&vrf, 12_34_56_78_90_12_34, 98_76_54_32_10_98_76)
        );
    }

    #[test]
    fn mix_dna_with_vrf_each_pair_is_inherited_or_mutated() {
        // Every pair of the child DNA is either parent 1's pair, parent 2's pair, or a
        // mutation in 0..=9 (plan §4.2, mirrors EVM `_mixDna`'s reuse of `pairRand % 100`
        // for the mutation branch, which is only ever < 10).
        let parent1 = 11_22_33_44_55_66_77_88u64;
        let parent2 = 99_88_77_66_55_44_33_22u64;
        for seed_byte in 0u8..=255 {
            let vrf = [seed_byte; 32];
            let child = mix_dna_with_vrf(&vrf, parent1, parent2);
            for i in 0..8u32 {
                let pair = digit_pair(child, i);
                let p1 = digit_pair(parent1, i);
                let p2 = digit_pair(parent2, i);
                assert!(
                    pair == p1 || pair == p2 || pair < 10,
                    "pair {i} = {pair} is neither parent's pair nor a mutation (<10)"
                );
            }
        }
    }

    #[test]
    fn mix_dna_with_vrf_zero_parents_yields_only_mutation_or_zero_pairs() {
        // With both parents' DNA all-zero, every inherited pair is 0, so every pair of the
        // child must be 0 (inherited) or in 0..=9 (mutation) — never >= 10.
        for seed_byte in 0u8..=255 {
            let vrf = [seed_byte; 32];
            let child = mix_dna_with_vrf(&vrf, 0, 0);
            for i in 0..8u32 {
                let pair = digit_pair(child, i);
                assert!(pair < 10, "pair {i} = {pair} should be < 10 for zero parents");
            }
        }
    }

    #[test]
    fn mint_dna_from_vrf_is_deterministic_and_domain_separated() {
        let vrf = [0x42u8; 32];
        assert_eq!(mint_dna_from_vrf(&vrf), mint_dna_from_vrf(&vrf));
        // Domain separation: the `b"mint"` tag must actually change the digest, not just
        // pass the raw VRF bytes through.
        assert_ne!(
            mint_dna_from_vrf(&vrf),
            u64::from_le_bytes(vrf[0..8].try_into().unwrap())
        );
    }

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
