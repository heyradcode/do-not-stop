//! Inventory items and equipment (roadmap §4).
//!
//! Lives in this program rather than one of its own because equipping has to read the pet's
//! Metaplex Core asset owner and, once the freeze lands, needs the `GlobalState` PDA's plugin
//! authority. Both are here. Solana has no bytecode ceiling forcing the split `ItemCore.sol`
//! made on EVM, so a separate program would buy a CPI and an authority delegation per equip
//! and nothing else.

pub mod catalog;
pub mod supply;

pub use catalog::*;
pub use supply::*;
