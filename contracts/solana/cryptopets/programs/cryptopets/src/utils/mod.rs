//! Solana ecosystem adapters — thin wrappers over external program dependencies.
//!
//! | Module       | Responsibility                                     |
//! |--------------|----------------------------------------------------|
//! | `randomness` | Switchboard VRF commit/reveal validation           |
//! | `metadata`   | Metaplex Core asset helpers (ownership, attributes)|

pub mod metadata;
pub mod randomness;
