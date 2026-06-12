//! Instruction handlers, grouped by gameplay domain. Each group re-exports its leaf
//! modules and their items, so `use instructions::*;` (see `lib.rs`) exposes every
//! handler module (`initialize::`, `commit_breed::`, ...) and every `Accounts` struct
//! exactly as it did when this directory was flat — no IDL or call-site impact.

pub mod admin;
pub mod battle;
pub mod breeding;
pub mod marriage;
pub mod mint;
pub mod pet;

pub use admin::*;
pub use battle::*;
pub use breeding::*;
pub use marriage::*;
pub use mint::*;
pub use pet::*;
