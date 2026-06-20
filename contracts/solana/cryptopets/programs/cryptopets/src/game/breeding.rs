//! Breed cooldown curve (plan §4.1, mirrors EVM `GameLogicV1._breedCooldownFor`).

use crate::state::BREED_COOLDOWN_CAP_SECONDS;

/// `base_seconds << breed_count`, capped at [`BREED_COOLDOWN_CAP_SECONDS`].
/// Clamp the shift to 31: `breed_count` (u8) can reach 255, and `i64 << 64` panics with
/// `overflow-checks = true`; shifts beyond ~20 already exceed the cap regardless of base.
pub fn breed_cooldown_for(breed_count: u8, base_seconds: i64) -> i64 {
    let cd = base_seconds << (breed_count as u32).min(31);
    cd.min(BREED_COOLDOWN_CAP_SECONDS)
}
