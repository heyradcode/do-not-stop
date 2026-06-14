//! Admin & ops instructions (plan §5, §6): one-time initialization, the pause switch,
//! `GlobalState` config setters, and fee-vault withdrawal. All gated on the
//! `global_state.admin` signer except `initialize` (which sets it).

pub mod config;
pub mod initialize;
pub mod pause;
pub mod unpause;
pub mod withdraw_fees;

pub use config::*;
pub use initialize::*;
pub use pause::*;
pub use unpause::*;
pub use withdraw_fees::*;
