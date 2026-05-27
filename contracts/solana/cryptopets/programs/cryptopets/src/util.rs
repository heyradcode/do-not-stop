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

/// Mirrors `Utils.calculateRarity` from the Ethereum CryptoPets contracts.
pub fn calculate_rarity(dna: u64) -> u8 {
    let score = dna % 100;
    if score < 50 {
        1
    } else if score < 75 {
        2
    } else if score < 90 {
        3
    } else if score < 98 {
        4
    } else {
        5
    }
}
