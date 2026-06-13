//! Marriage system (plan §4.4): consent gate for cross-owner breeding. Propose/accept
//! with a TTL'd proposal PDA, cancel by the proposer, divorce (applies the marriage
//! cooldown), and permissionless stale-marriage cleanup when either pet changes owner.

pub mod accept_marriage;
pub mod cancel_marriage_proposal;
pub mod clear_stale_marriage;
pub mod divorce;
pub mod propose_marriage;

pub use accept_marriage::*;
pub use cancel_marriage_proposal::*;
pub use clear_stale_marriage::*;
pub use divorce::*;
pub use propose_marriage::*;
