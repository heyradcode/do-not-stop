//! Breed cooldown curve (plan §4.1, mirrors EVM `GameLogicV1._breedCooldownFor`).

use crate::state::BREED_COOLDOWN_CAP_SECONDS;

/// `base_seconds << breed_count`, capped at [`BREED_COOLDOWN_CAP_SECONDS`].
/// Clamp the shift to 31: `breed_count` (u8) can reach 255, and `i64 << 64` panics with
/// `overflow-checks = true`; shifts beyond ~20 already exceed the cap regardless of base.
pub fn breed_cooldown_for(breed_count: u8, base_seconds: i64) -> i64 {
    let cd = base_seconds << (breed_count as u32).min(31);
    cd.min(BREED_COOLDOWN_CAP_SECONDS)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::{MAX_BREED_COOLDOWN_BASE_SECONDS, DEFAULT_BREED_COOLDOWN_BASE_SECONDS};

    /// Mirrors EVM `GameLogicV1._breedCooldownFor` (plan §4.1): doubles per prior breed.
    #[test]
    fn doubles_per_breed_until_the_cap() {
        let base = 3600;
        assert_eq!(breed_cooldown_for(0, base), base);
        assert_eq!(breed_cooldown_for(1, base), base * 2);
        assert_eq!(breed_cooldown_for(2, base), base * 4);
        assert_eq!(breed_cooldown_for(9, base), base * 512);
    }

    #[test]
    fn saturates_at_the_thirty_day_cap() {
        let base = 3600;
        // 3600 << 9 = 1_843_200s, the last count under the 2_592_000s cap.
        assert!(breed_cooldown_for(9, base) < BREED_COOLDOWN_CAP_SECONDS);
        // 3600 << 10 = 3_686_400s, the first over it.
        assert_eq!(breed_cooldown_for(10, base), BREED_COOLDOWN_CAP_SECONDS);
        assert_eq!(breed_cooldown_for(200, base), BREED_COOLDOWN_CAP_SECONDS);
    }

    /// The shift clamp is why a high `breed_count` returns the cap instead of panicking.
    ///
    /// `breed_count` is a `u8` and reaches 255 on a heavily bred pet, but `i64 << 64`
    /// panics under `overflow-checks = true` rather than wrapping. Clamping to 31 costs
    /// nothing, since any shift past ~11 already exceeds the cap at any legal base.
    ///
    /// The clamp alone is not what keeps the shift itself in range: that is the setter
    /// bound. `MAX_BREED_COOLDOWN_BASE_SECONDS << 31` is about 5.6e15, comfortably inside
    /// `i64`, so `set_breed_cooldown_base_seconds` refusing anything larger is what makes
    /// the worst case safe. Raising that bound without revisiting this would reintroduce
    /// the panic.
    #[test]
    fn clamps_the_shift_rather_than_overflowing() {
        for breed_count in [31u8, 32, 63, 64, 127, 255] {
            assert_eq!(
                breed_cooldown_for(breed_count, MAX_BREED_COOLDOWN_BASE_SECONDS),
                BREED_COOLDOWN_CAP_SECONDS,
                "breed_count {} must saturate, not panic",
                breed_count
            );
        }
    }

    /// A zero base disables the curve outright rather than producing a one-second cooldown.
    #[test]
    fn zero_base_stays_zero_at_every_count() {
        assert_eq!(breed_cooldown_for(0, 0), 0);
        assert_eq!(breed_cooldown_for(255, 0), 0);
    }

    /// The shipped default is deliberately a dev-scale value, not a production one.
    #[test]
    fn default_base_doubles_from_five_seconds() {
        assert_eq!(breed_cooldown_for(0, DEFAULT_BREED_COOLDOWN_BASE_SECONDS), 5);
        assert_eq!(breed_cooldown_for(3, DEFAULT_BREED_COOLDOWN_BASE_SECONDS), 40);
    }
}
