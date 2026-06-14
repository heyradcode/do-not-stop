//! Battle flow (plan §3): commit randomness against a consenting defender, settle by
//! running the deterministic combat sim and awarding XP, cancel an expired request,
//! and the defender-consent `open_to_challenges` toggle (plan §3.5).

pub mod cancel_battle;
pub mod commit_battle;
pub mod set_open_to_challenges;
pub mod settle_battle;

pub use cancel_battle::*;
pub use commit_battle::*;
pub use set_open_to_challenges::*;
pub use settle_battle::*;
