/// Folds byte slices into a `u64` using the splitmix64 **finalizer** as a per-byte mixer.
///
/// Solana programs cannot access verifiable randomness without an oracle (e.g. Switchboard
/// VRF). This mirrors the spirit of Ethereum's `randMod` in `Utils.sol`: a deterministic mix
/// over caller-visible inputs (`slot`, `unix_timestamp`, pubkeys, parent DNAs, etc.). A client
/// can simulate the outcome off-chain before signing — do not use for high-stakes fairness.
pub fn pseudo_random(seeds: &[&[u8]]) -> u64 {
    let mut x: u64 = 0x9E37_79B9_7F4A_7C15;

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
