//! XP formula (plan §3.4, mirrors EVM `GameLogicV1._calcXp`).

/// `base_xp * clamp(100 + 10*(opp_level - my_level), 0, 200) / 100`
pub fn calc_xp(base_xp: u32, my_level: u16, opp_level: u16) -> u32 {
    let diff = opp_level as i32 - my_level as i32;
    let mult = 100 + 10 * diff;
    if mult <= 0 {
        return 0;
    }
    let mult = mult.min(200) as u64;

    // Perform multiplication and division in u64 space to prevent overflow
    let total_xp = (base_xp as u64 * mult) / 100;

    // Safe to downcast back to u32 because max value is bounded by (u32::MAX * 200) / 100
    // which always safely fits back into a u32.
    total_xp as u32
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Cross-chain golden vectors (plan §3.4, §7), transcribed from
    /// `contracts/test-vectors/xp.json`'s `calcXpCases` (kept in sync manually with
    /// `GameLogicV1._calcXp` / `XpFormula.test.ts`).
    #[test]
    fn calc_xp_matches_evm_golden_vectors() {
        let cases: &[(&str, u32, u16, u16, u32)] = &[
            // (name, base_xp, my_level, opp_level, expected_xp)
            ("delta-zero", 100, 10, 10, 100),
            ("delta-plus10-cap-boundary", 100, 10, 20, 200),
            ("delta-plus11-clamped", 100, 10, 21, 200),
            ("delta-minus10-zero-boundary", 100, 20, 10, 0),
            ("delta-minus11-clamped", 100, 21, 10, 0),
            ("delta-minus5-loser-xp", 25, 15, 10, 12),
            ("delta-plus5-loser-xp", 25, 10, 15, 37),
            ("delta-plus15-clamped-loser-xp", 25, 5, 20, 50),
        ];

        for (name, base_xp, my_level, opp_level, expected) in cases {
            assert_eq!(
                calc_xp(*base_xp, *my_level, *opp_level),
                *expected,
                "vector \"{}\" mismatch",
                name
            );
        }
    }
}
