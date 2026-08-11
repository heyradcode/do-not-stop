//! The reward leaf and Merkle proof walk, reproduced on chain.
//!
//! These bytes must match `@cryptopets/protocol`'s `wideRewardMerkleLeaf` and `merkleNode`
//! exactly. Nothing checks that at compile time, so
//! `contracts/test-vectors/reward-leaf.json` pins it: the TypeScript side generates the
//! file and `tests/leaf_vectors.rs` replays it here. A drift makes every proof fail with no
//! indication which side moved, which is the same reason the combat vectors exist.
//!
//! Everything here is `no_std`-shaped pure computation: no accounts, no clock, no CPI.

use anchor_lang::prelude::*;
use solana_keccak_hasher as keccak;

/// `keccak256("CRYPTOPETS_MERKLE_REWARD_LEAF_V1")`, the protocol's reward-leaf domain tag.
///
/// A literal rather than a hash of the string at runtime: the compute cost is irrelevant,
/// but a typo'd tag string would produce a plausible constant nobody could trace back, while
/// a wrong literal fails the vector test immediately.
pub const REWARD_LEAF_DOMAIN: [u8; 32] = [
    0xc3, 0x42, 0xc4, 0xfa, 0x3c, 0x21, 0xcb, 0x06, 0x93, 0x42, 0x18, 0xe7, 0xa5, 0xf8, 0xd5, 0x1c,
    0xd5, 0x9f, 0x0b, 0x29, 0xb5, 0x60, 0xd4, 0x7d, 0xa9, 0x1b, 0x98, 0x3c, 0x83, 0x96, 0x79, 0x0b,
];

/// `keccak256("CRYPTOPETS_MERKLE_NODE_V1")`, the internal-node tag.
///
/// Distinct from the leaf tag on purpose. Hashing a pair with no tag lets an internal node
/// be presented as a leaf, which is what turns a valid proof into a forgeable one.
pub const MERKLE_NODE_DOMAIN: [u8; 32] = [
    0xfc, 0x3a, 0x24, 0x40, 0x06, 0x52, 0xb1, 0xe1, 0xb0, 0xcb, 0xd8, 0xaa, 0x53, 0x65, 0x6a, 0x5a,
    0x5a, 0xf5, 0xf5, 0xab, 0x61, 0x5d, 0x7f, 0xae, 0xb2, 0xc3, 0x7d, 0xd5, 0x11, 0xe0, 0x9c, 0xa1,
];

/// The wide (32-byte account) reward leaf layout. Version 1 is EVM's 20-byte one, which is
/// not retired and never will be; see `WIDE_REWARD_LEAF_SCHEMA_VERSION` in the protocol.
pub const REWARD_LEAF_SCHEMA_VERSION: u16 = 2;

/// A `uint256` field, big-endian, matching the protocol's `uintToBytes`.
///
/// Big-endian, not Borsh's little-endian: this is a hash preimage shared with an encoder
/// that had to be reproducible in Solidity's `abi.encodePacked`, not an account layout.
/// Mixing the two up is silent, and every proof fails.
fn u256_be(value: u128) -> [u8; 32] {
    let mut out = [0u8; 32];
    out[16..].copy_from_slice(&value.to_be_bytes());
    out
}

/// `keccak256(REWARD_LEAF_DOMAIN || version || chainRef || distributor || seasonId ||
/// wallet || token || amount)`.
///
/// Every argument here comes from program state or from the program itself, never from the
/// claimant: `distributor` is this program's id, `chain_ref` and `token` are read off the
/// season account, and `wallet` is an account key. That is what makes a proof built for one
/// deployment fail on another rather than being replayable.
pub fn reward_leaf(
    chain_ref: &[u8; 32],
    distributor: &Pubkey,
    season_id: u32,
    wallet: &Pubkey,
    token: &Pubkey,
    amount: u64,
) -> [u8; 32] {
    keccak::hashv(&[
        &REWARD_LEAF_DOMAIN,
        &REWARD_LEAF_SCHEMA_VERSION.to_be_bytes(),
        chain_ref,
        distributor.as_ref(),
        &u256_be(season_id as u128),
        wallet.as_ref(),
        token.as_ref(),
        &u256_be(amount as u128),
    ])
    .to_bytes()
}

/// `keccak256(NODE_DOMAIN || min(a, b) || max(a, b))`.
///
/// Sorted so a proof needs no direction bits. The comparison is byte-wise lexicographic,
/// which is what Rust's slice ordering gives and what the TypeScript side's `compareBytes`
/// and Solidity's `bytes32` comparison both do.
pub fn hash_node(a: &[u8; 32], b: &[u8; 32]) -> [u8; 32] {
    let (first, second) = if a <= b { (a, b) } else { (b, a) };
    keccak::hashv(&[&MERKLE_NODE_DOMAIN, first, second]).to_bytes()
}

/// Folds `leaf` through `proof` and reports whether it arrives at `root`.
pub fn verify_proof(proof: &[[u8; 32]], root: &[u8; 32], leaf: &[u8; 32]) -> bool {
    let mut computed = *leaf;
    for sibling in proof {
        computed = hash_node(&computed, sibling);
    }
    computed == *root
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn u256_be_is_big_endian_and_left_padded() {
        assert_eq!(u256_be(0)[31], 0);
        let one = u256_be(1);
        assert_eq!(one[31], 1);
        assert!(one[..31].iter().all(|b| *b == 0));

        let value = u256_be(0x0102_0304);
        assert_eq!(&value[28..], &[0x01, 0x02, 0x03, 0x04]);
    }

    #[test]
    fn hash_node_ignores_the_order_of_its_children() {
        let a = [0x11u8; 32];
        let b = [0x22u8; 32];
        assert_eq!(hash_node(&a, &b), hash_node(&b, &a));
    }

    /// The tag is what stops an internal node being presented as a leaf.
    #[test]
    fn node_and_leaf_domains_differ() {
        assert_ne!(REWARD_LEAF_DOMAIN, MERKLE_NODE_DOMAIN);
    }

    #[test]
    fn every_leaf_field_changes_the_digest() {
        let chain_ref = [0x33u8; 32];
        let distributor = Pubkey::new_from_array([0x44u8; 32]);
        let wallet = Pubkey::new_from_array([0x55u8; 32]);
        let token = Pubkey::new_from_array([0x66u8; 32]);
        let base = reward_leaf(&chain_ref, &distributor, 1, &wallet, &token, 1_000);

        let other = Pubkey::new_from_array([0x77u8; 32]);
        assert_ne!(base, reward_leaf(&[0x77u8; 32], &distributor, 1, &wallet, &token, 1_000));
        assert_ne!(base, reward_leaf(&chain_ref, &other, 1, &wallet, &token, 1_000));
        assert_ne!(base, reward_leaf(&chain_ref, &distributor, 2, &wallet, &token, 1_000));
        assert_ne!(base, reward_leaf(&chain_ref, &distributor, 1, &other, &token, 1_000));
        assert_ne!(base, reward_leaf(&chain_ref, &distributor, 1, &wallet, &other, 1_000));
        assert_ne!(base, reward_leaf(&chain_ref, &distributor, 1, &wallet, &token, 1_001));
    }

    #[test]
    fn a_single_leaf_tree_verifies_against_itself() {
        let leaf = [0xabu8; 32];
        assert!(verify_proof(&[], &leaf, &leaf));
    }

    #[test]
    fn a_wrong_sibling_fails_to_verify() {
        let leaf = [0xabu8; 32];
        let sibling = [0xcdu8; 32];
        let root = hash_node(&leaf, &sibling);
        assert!(verify_proof(&[sibling], &root, &leaf));
        assert!(!verify_proof(&[[0xeeu8; 32]], &root, &leaf));
    }

    // ─── Golden vectors ───────────────────────────────────────────────────────

    fn filled(byte: u8) -> Pubkey {
        Pubkey::new_from_array([byte; 32])
    }

    /// Cross-language golden vectors, transcribed from
    /// `contracts/test-vectors/protocol-reward-leaf.json` (generated by
    /// `pnpm --filter @cryptopets/protocol vectors`). **Keep in sync manually:** this crate
    /// has no JSON dependency, matching the Solana combat port, so the file is not read
    /// directly.
    ///
    /// If one of these fails, this program's encoder has drifted from the one that built
    /// every published tree, and no claim will verify. Fix the encoder, never the vector.
    #[test]
    fn matches_the_typescript_encoder() {
        let cases: &[(&str, [u8; 32], Pubkey, u32, Pubkey, Pubkey, u64, [u8; 32])] = &[
            (
                "baseline",
                [0x33; 32],
                filled(0x44),
                1,
                filled(0x55),
                filled(0x66),
                1_000_000_000_000_000_000,
                hex32("0d423a28d5eaddae26ea9578435a3df0b863fc6ee70d0e091d9779d12d298d49"),
            ),
            (
                "zero-amount",
                [0x33; 32],
                filled(0x44),
                1,
                filled(0x55),
                filled(0x66),
                0,
                hex32("e31ffc8867dc04b5a352e7ee04b4de1253821bcc398f15944a8029716ae66211"),
            ),
            (
                // Pins the left-padding of amount at the widest value Solana can hold.
                "max-u64-amount",
                [0x33; 32],
                filled(0x44),
                1,
                filled(0x55),
                filled(0x66),
                u64::MAX,
                hex32("3699025d4d459c0dcc781a89c918a001fd1b51ecebf838a16602f521946b679d"),
            ),
            (
                // Pins the left-padding of seasonId.
                "max-u32-season",
                [0x33; 32],
                filled(0x44),
                u32::MAX,
                filled(0x55),
                filled(0x66),
                1,
                hex32("786c9566fed0e205b606c0ed0e177de96e050612a8ee17ebb1c1d06b52a80cb7"),
            ),
            (
                "zero-accounts",
                [0x00; 32],
                filled(0x00),
                0,
                filled(0x00),
                filled(0x00),
                0,
                hex32("0daec6f548383da177d5ba599c4571d0a3e6b3a0b9e4a7ad94440a607ce7ac9d"),
            ),
        ];

        for (name, chain_ref, distributor, season_id, wallet, token, amount, expected) in cases {
            assert_eq!(
                reward_leaf(chain_ref, distributor, *season_id, wallet, token, *amount),
                *expected,
                "reward-leaf vector {}",
                name
            );
        }
    }

    /// Decodes a 64-character hex literal. Only used by the vector table above.
    fn hex32(hex: &str) -> [u8; 32] {
        let bytes = hex.as_bytes();
        assert_eq!(bytes.len(), 64, "expected 64 hex characters, got {}", bytes.len());
        let mut out = [0u8; 32];
        for (i, chunk) in bytes.chunks_exact(2).enumerate() {
            let hi = (chunk[0] as char).to_digit(16).expect("hex digit");
            let lo = (chunk[1] as char).to_digit(16).expect("hex digit");
            out[i] = ((hi << 4) | lo) as u8;
        }
        out
    }
}
