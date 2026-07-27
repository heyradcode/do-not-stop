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
//!
//! `battle_sim` and `xp` have no caller left in this program: the instructions that
//! used them were retired with the on-chain battle path (§L Phase 6). They stay, frozen
//! and untouched, because every battle this program settled is a permanent on-chain
//! record that has to keep replaying — and their golden-vector tests are what proves
//! `contracts/test-vectors/{battle,xp}.json` still describe what really settled here.
//! Deleting them would quietly remove that proof. See AGENTS.md's non-negotiables.

pub mod battle_sim;
pub mod breeding;
pub mod dna;
pub mod genetics;
pub mod rarity;
pub mod xp;
