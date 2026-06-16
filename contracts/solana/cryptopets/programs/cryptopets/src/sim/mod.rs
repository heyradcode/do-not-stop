//! Pure, stateless game mechanics — no Anchor or Solana account types.
//!
//! These modules implement the core simulation layer shared across chains.
//! Cross-chain golden-vector parity with the EVM contracts is required (plan §7);
//! do not modify the algorithms without updating both sides and the test vectors.

pub mod combat;
pub mod dna;
pub mod rarity;
