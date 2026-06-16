//! Switchboard VRF commit/reveal plumbing.
//!
//! Validates that a Switchboard `RandomnessAccountData` account is in the correct phase
//! for the calling instruction. VRF-derived game computations (DNA mixing, rarity
//! inheritance) live in [`crate::game::genetics`].

use anchor_lang::prelude::*;
use switchboard_on_demand::RandomnessAccountData;

use crate::errors::ErrorCode;

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
