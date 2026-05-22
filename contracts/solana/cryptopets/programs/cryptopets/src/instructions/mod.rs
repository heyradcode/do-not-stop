pub mod create_starter_pet;
pub mod initialize;
pub mod level_up;
pub mod pause;
pub mod rename_pet;
pub mod transfer_pet;
pub mod unpause;

// 🔥 THIS is what Anchor needs
pub use create_starter_pet::*;
pub use initialize::*;
pub use level_up::*;
pub use pause::*;
pub use rename_pet::*;
pub use transfer_pet::*;
pub use unpause::*;
