//! Single-pet owner actions: paid level-up, paid XP training (plan §3.4), cosmetic
//! rename, and the permissionless `sync_metadata` refresh of the pet's Metaplex Core
//! Attributes plugin (plan §2.3/v2.1 Phase A).

pub mod level_up;
pub mod rename_pet;
pub mod sync_metadata;
pub mod train;

pub use level_up::*;
pub use rename_pet::*;
pub use sync_metadata::*;
pub use train::*;
