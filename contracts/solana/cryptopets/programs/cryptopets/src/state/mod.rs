pub mod global;
pub mod marriage;
pub mod pet;
pub mod requests;

pub use global::*;
pub use marriage::*;
pub use pet::*;
pub use requests::*;

/// Account layout version for newly written accounts. Bump when adding fields that
/// consume `_reserved` space, so off-chain readers can detect the layout in use.
///
/// v2: Phase 3 data model (plan §4/§9.1) — adds `generation`, `parent1_id`,
/// `parent2_id`, `breed_count`, `breed_ready_time`, `train_ready_time`, `species_id`
/// to `PetAccount` and bumps `PetAccount::SPACE`. Breaking; requires redeploy + reindex.
///
/// v3: adds `breed_fee_lamports` to `GlobalState` and widens its `_reserved` buffer
/// (3 -> 32 bytes) to cover upcoming marriage-system fields (plan §4.4) without another
/// breaking change. Bumps `GlobalState::SPACE`. Breaking; requires redeploy + reinit of
/// `GlobalState` (`PetAccount`/`PlayerProfile` layouts unchanged).
///
/// v4: adds `spouse_id`, `marriage_owner_snapshot`, and `marriage_cooldown_until` to
/// `PetAccount` (plan §4.4, mirrors EVM `marriageOf`/`marriageCooldownUntil`) and shrinks
/// its `_reserved` buffer (22 -> 8 bytes). Bumps `PetAccount::SPACE`. Breaking; requires
/// redeploy + reinit of pet accounts (`GlobalState`/`PlayerProfile` layouts unchanged).
///
/// v5: Phase A groundwork (plan §2.3/§9.2) — adds `collection: Pubkey` to `GlobalState`,
/// the Metaplex Core "CryptoPets" collection created in `initialize` (collection/plugin
/// authority is the `GlobalState` PDA), and widens its `_reserved` buffer (8 -> 24 bytes)
/// for the rest of Phase A. Bumps `GlobalState::SPACE`. Breaking; requires redeploy +
/// reinit of `GlobalState` (`PetAccount`/`PlayerProfile` layouts unchanged by this entry —
/// `PetAccount`'s re-seed to `[b"pet", asset_pubkey]` and the CPI mint paths land in
/// subsequent steps and will bump the version again).
///
/// v6: adds `asset: Pubkey` to `PetAccount` (plan §2.3/v2.1 Phase A) — the Metaplex Core
/// asset pubkey minted into the "CryptoPets" collection by `settle_mint`/`settle_breed`'s
/// CPI. `PetAccount`'s PDA seeds are now `[PetAccount::SEED, asset_pubkey]` (replacing
/// `[PetAccount::SEED, owner, pet_id]`), and the Core asset's `owner` field (read via
/// `metadata::core_asset_owner`) is the source of truth for pet ownership, replacing
/// `pet.owner` (now informational-only, see its doc comment). `transfer_pet` is removed —
/// ownership transfers happen as standard Core asset transfers through any wallet. Bumps
/// `PetAccount::SPACE` (+32 bytes). Breaking; requires redeploy + reinit of pet accounts
/// (`GlobalState`/`PlayerProfile` layouts unchanged).
pub const CURRENT_ACCOUNT_VERSION: u8 = 6;

/// PDA seed for the lamport-only fee vault (§6 Solana #5). Holds `level_up_fee_lamports`
/// and future protocol fees; swept via `withdraw_fees`.
pub const FEE_VAULT_SEED: &[u8] = b"fee-vault";
