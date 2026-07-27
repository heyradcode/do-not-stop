//! The defender-consent `open_to_challenges` toggle (plan §3.5).
//!
//! The commit/settle/cancel battle instructions that used to live here are gone: battles
//! are resolved by the backend against a committed drand round and published as signed
//! receipts (docs/plan-backend-battle-architecture.md §L Phase 6), never on chain. The
//! combat simulator itself (`game::battle_sim`) stays, frozen, so every battle this
//! program did settle remains replayable.

pub mod set_open_to_challenges;

pub use set_open_to_challenges::*;
