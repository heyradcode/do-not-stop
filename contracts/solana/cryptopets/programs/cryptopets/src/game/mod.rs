//! Pure, stateless game logic — no Anchor or Solana account types.
//!
//! | Module      | Responsibility                                      |
//! |-------------|-----------------------------------------------------|
//! | `dna`       | DNA → attribute derivation, element wheel           |
//! | `rarity`    | Rarity tier enum and score ladder                   |
//! | `genetics`  | VRF-derived DNA mixing and rarity inheritance       |
//! | `battle_sim`| Round-based battle simulator                        |
//! | `xp`        | XP formula (level-delta multiplier)                 |
//! | `breeding`  | Breed cooldown curve                                |
//!
//! Cross-chain golden-vector parity with the EVM contracts is required (plan §7);
//! do not modify the algorithms without updating both sides and the test vectors.

pub mod battle_sim;
pub mod breeding;
pub mod dna;
pub mod genetics;
pub mod rarity;
pub mod xp;
