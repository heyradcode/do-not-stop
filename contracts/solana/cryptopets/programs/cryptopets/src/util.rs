use anchor_lang::prelude::*;
use switchboard_on_demand::RandomnessAccountData;

use crate::errors::ErrorCode;

/// Maps Switchboard's 32-byte reveal to a roll in `0..=u64::MAX` for battle odds.
pub fn battle_roll_from_vrf(vrf: &[u8; 32]) -> u64 {
    u64::from_le_bytes(vrf[0..8].try_into().unwrap())
}

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
