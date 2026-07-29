use anchor_lang::prelude::*;

use crate::errors::ErrorCode;

// ─── Config defaults (mirrors EVM GameConfig initializers) ────────────────────

/// Battle-cooldown lockout applied to a pet's `ready_time`. Despite the name, the only
/// writer left is `commit_breed`, which locks both parents out for the pending-breed
/// window; the post-battle cooldown itself is now the backend's
/// (`BATTLE_COOLDOWN_SECONDS`), applied to `pet_battle_progress`.
pub const DEFAULT_BATTLE_COOLDOWN_SECONDS: i64 = 5;

/// Slots a committed Switchboard randomness has to be revealed before `cancel_mint` /
/// `cancel_breed` may close the stuck request (§5: ~150 slots, ~1 minute).
pub const DEFAULT_RANDOMNESS_EXPIRY_SLOTS: u64 = 150;

/// Hard level cap (§6 Solana #4 / mirrors EVM `GameConfig.maxLevel`). Battle wins stop
/// granting levels once a pet reaches this; `level_up` rejects further fee-paid levels too.
pub const DEFAULT_MAX_LEVEL: u16 = 100;

/// Max child generation for breeding (plan §4.1, mirrors EVM `GameConfig.generationCap`).
pub const DEFAULT_GENERATION_CAP: u8 = 20;

/// Breed cooldown base in seconds; doubles per `breed_count` up to
/// [`BREED_COOLDOWN_CAP_SECONDS`] (plan §4.1, mirrors EVM `GameConfig.breedCooldownBase`).
pub const DEFAULT_BREED_COOLDOWN_BASE_SECONDS: i64 = 5;

/// Hard cap on the breed cooldown curve (plan §4.1, mirrors EVM's `30 days` cap in
/// `GameLogicV1._breedCooldownFor`).
pub const BREED_COOLDOWN_CAP_SECONDS: i64 = 30 * 24 * 60 * 60;

/// Default newborn battle-cooldown lockout applied to bred pets (plan §4.2, mirrors EVM
/// `GameConfig.newbornCooldown`).
pub const DEFAULT_NEWBORN_COOLDOWN_SECONDS: i64 = 60;

/// Default species pool size per rarity tier (plan §3.7, mirrors EVM
/// `GameConfig`'s constructor, which sets `poolSizes[1..=5] = 8`).
pub const DEFAULT_POOL_SIZE: u8 = 8;

/// Fee charged by `commit_breed`, transferred to the fee vault (plan §4.3, mirrors EVM
/// `GameConfig.breedFee`).
pub const DEFAULT_BREED_FEE_LAMPORTS: u64 = 10_000_000; // 0.01 SOL

/// Base fee for the gacha mint (plan §4.3, mirrors EVM `GameConfig.baseMintFee`).
/// Escalates per wallet as `baseMintFee << min(mint_count, 7)` (up to 128x).
pub const DEFAULT_BASE_MINT_FEE_LAMPORTS: u64 = 20_000_000; // 0.02 SOL

/// Base train fee in lamports, scaled per pet level by [`train_fee_for`] (plan §3.4/§5,
/// mirrors EVM `GameConfig.trainFee`).
pub const DEFAULT_TRAIN_FEE_LAMPORTS: u64 = 10_000_000; // 0.01 SOL

/// Per-pet train cooldown in seconds (plan §3.4/§5, mirrors EVM `GameConfig.trainCooldown`).
pub const DEFAULT_TRAIN_COOLDOWN_SECONDS: i64 = 60;

/// Flat XP granted per train (plan §3.4/§5, mirrors EVM `GameConfig.trainXp`).
pub const DEFAULT_TRAIN_XP: u32 = 100;

/// Stud fee for cross-owner breeding, paid to the non-initiating spouse's owner (plan
/// §4.4, mirrors EVM `GameConfig.studFee`).
pub const DEFAULT_STUD_FEE_LAMPORTS: u64 = 20_000_000; // 0.02 SOL

/// Cooldown applied to both pets after a divorce or stale-marriage cleanup before either
/// may marry again (plan §4.4, mirrors EVM `GameConfig.marriageCooldown`).
pub const DEFAULT_MARRIAGE_COOLDOWN_SECONDS: i64 = 60;

/// Expiry window for a pending marriage proposal (plan §4.4, mirrors EVM
/// `GameConfig.proposalTTL`).
pub const DEFAULT_PROPOSAL_TTL_SECONDS: i64 = 60;

// ─── Setter bounds (§5 setter hygiene) ────────────────────────────────────────

pub const MAX_BATTLE_COOLDOWN_SECONDS: i64 = 7 * 24 * 60 * 60;
pub const MAX_LEVEL_UP_FEE_LAMPORTS: u64 = 1_000_000_000; // 1 SOL
pub const MAX_RANDOMNESS_EXPIRY_SLOTS: u64 = 1_512_000; // ~7 days at 400ms/slot
pub const MAX_GENERATION_CAP: u8 = 100;
pub const MAX_BREED_COOLDOWN_BASE_SECONDS: i64 = BREED_COOLDOWN_CAP_SECONDS;
pub const MAX_NEWBORN_COOLDOWN_SECONDS: i64 = 7 * 24 * 60 * 60;
pub const MAX_BASE_MINT_FEE_LAMPORTS: u64 = 1_000_000_000; // 1 SOL
pub const MAX_BREED_FEE_LAMPORTS: u64 = 1_000_000_000; // 1 SOL
pub const MAX_TRAIN_FEE_LAMPORTS: u64 = 1_000_000_000; // 1 SOL
pub const MAX_TRAIN_COOLDOWN_SECONDS: i64 = 7 * 24 * 60 * 60;
pub const MAX_TRAIN_XP: u32 = 10_000;
pub const MAX_STUD_FEE_LAMPORTS: u64 = 1_000_000_000; // 1 SOL
pub const MAX_MARRIAGE_COOLDOWN_SECONDS: i64 = 7 * 24 * 60 * 60;
pub const MAX_PROPOSAL_TTL_SECONDS: i64 = 7 * 24 * 60 * 60;

// ─── Account types ────────────────────────────────────────────────────────────

#[account]
pub struct GlobalState {
    pub admin: Pubkey,
    pub level_up_fee_lamports: u64,
    pub battle_cooldown_seconds: i64,
    pub next_pet_id: u32,
    pub paused: bool,
    pub version: u8,
    pub bump: u8,
    pub randomness_expiry_slots: u64,
    pub max_level: u16,
    /// Max child generation for breeding (plan §4.1, mirrors EVM `generationCap`).
    pub generation_cap: u8,
    /// Breed cooldown base in seconds; doubles per `breed_count`, capped at
    /// [`BREED_COOLDOWN_CAP_SECONDS`] (plan §4.1, mirrors EVM `breedCooldownBase`).
    pub breed_cooldown_base_seconds: i64,
    /// Newborn battle-cooldown lockout applied to a bred pet's `ready_time` (plan §4.2,
    /// mirrors EVM `newbornCooldown`).
    pub newborn_cooldown_seconds: i64,
    /// Species pool sizes per rarity tier, indexed by `rarity - 1` for tiers 1..=5 (plan
    /// §3.7, mirrors EVM `GameConfig.poolSizes`). `speciesId = digitPair(dna, 6) %
    /// pool_sizes[rarity - 1]`, or `0` if the tier's pool size is `0`.
    pub pool_sizes: [u8; 5],
    /// Base fee for the gacha mint, escalated per wallet by `commit_mint` (plan §4.3,
    /// mirrors EVM `GameConfig.baseMintFee`).
    pub base_mint_fee_lamports: u64,
    /// Base train fee in lamports, scaled per pet level by [`train_fee_for`] (plan §3.4,
    /// mirrors EVM `GameConfig.trainFee`).
    pub train_fee_lamports: u64,
    /// Per-pet train cooldown in seconds (plan §3.4, mirrors EVM `GameConfig.trainCooldown`).
    pub train_cooldown_seconds: i64,
    /// Flat XP granted per train (plan §3.4, mirrors EVM `GameConfig.trainXp`).
    pub train_xp: u32,
    /// Fee charged by `commit_breed`, transferred to the fee vault (plan §4.3, mirrors
    /// EVM `GameConfig.breedFee`).
    pub breed_fee_lamports: u64,
    /// Stud fee for cross-owner breeding, paid to the non-initiating spouse's owner
    /// (plan §4.4, mirrors EVM `GameConfig.studFee`).
    pub stud_fee_lamports: u64,
    /// Cooldown applied to both pets after a divorce or stale-marriage cleanup before
    /// either may marry again (plan §4.4, mirrors EVM `GameConfig.marriageCooldown`).
    pub marriage_cooldown_seconds: i64,
    /// Expiry window for a pending marriage proposal (plan §4.4, mirrors EVM
    /// `GameConfig.proposalTTL`).
    pub proposal_ttl_seconds: i64,
    /// Metaplex Core "CryptoPets" collection (plan §2.3/v2.1 Phase A), created in
    /// `initialize`. Collection/plugin authority is the `GlobalState` PDA; `settle_mint`
    /// and `settle_breed` CPI into `mpl-core` to mint pet assets into it.
    pub collection: Pubkey,
    /// Reserved padding for fields added by future upgrades without moving any of the
    /// above. Grown as retired fields were reclaimed — 16 → 24 for `battle_fee_lamports`,
    /// 24 → 26 for `level_band_width` — so [`GlobalState::SPACE`] never changes and the
    /// account's rent-exempt size stays put.
    ///
    /// The two removals differ in blast radius. `battle_fee_lamports` sat immediately before
    /// this, so reclaiming it preserved every preceding offset. `level_band_width` sat
    /// mid-struct, so every field after it moved: this account must be re-initialized
    /// (see `CURRENT_ACCOUNT_VERSION` v7).
    pub _reserved: [u8; 26],
}

impl GlobalState {
    pub const SEED: &'static [u8] = b"global-state";
    pub const SPACE: usize = 8 /* discriminator */
        + 32 /* admin */
        + 8 /* level_up_fee_lamports */
        + 8 /* battle_cooldown_seconds */
        + 4 /* next_pet_id */
        + 1 /* paused */
        + 1 /* version */
        + 1 /* bump */
        + 8 /* randomness_expiry_slots */
        + 2 /* max_level */
        + 1 /* generation_cap */
        + 8 /* breed_cooldown_base_seconds */
        + 8 /* newborn_cooldown_seconds */
        + 5 /* pool_sizes */
        + 8 /* base_mint_fee_lamports */
        + 8 /* train_fee_lamports */
        + 8 /* train_cooldown_seconds */
        + 4 /* train_xp */
        + 8 /* breed_fee_lamports */
        + 8 /* stud_fee_lamports */
        + 8 /* marriage_cooldown_seconds */
        + 8 /* proposal_ttl_seconds */
        + 32 /* collection */
        + 26; /* reserved */
}

#[account]
pub struct PlayerProfile {
    pub owner: Pubkey,
    /// Dead field (plan §2.3/v2.1 Phase A, mirrors EVM `ownerPetCount`): counted mints
    /// and breeds, but never decremented on transfer-out, so once pets become standard
    /// Core asset transfers it no longer reflects pets currently owned. [`mint_count`]
    /// is the field that matters for fee escalation. Kept in place, no longer
    /// incremented, to preserve the existing account layout (no `CURRENT_ACCOUNT_VERSION`
    /// bump needed).
    pub pet_count: u16,
    /// Dead field (plan §4.3): the free starter mint is removed entirely in favor of
    /// the paid gacha mint (`commit_mint`/`settle_mint`). Kept in place, always
    /// `false`, to preserve the existing account layout (no `CURRENT_ACCOUNT_VERSION`
    /// bump needed).
    pub starter_created: bool,
    pub version: u8,
    pub bump: u8,
    /// Lifetime gacha mints from this wallet (plan §4.3, mirrors EVM
    /// `PetCoreV1.walletMintCount`); drives [`mint_fee_for`]'s fee escalation.
    pub mint_count: u32,
    pub _reserved: [u8; 60],
}

impl PlayerProfile {
    pub const SEED: &'static [u8] = b"player-profile";
    pub const SPACE: usize = 8 /* discriminator */
        + 32 /* owner */
        + 2 /* pet_count (dead) */
        + 1 /* starter_created (dead) */
        + 1 /* version */
        + 1 /* bump */
        + 4 /* mint_count */
        + 60; /* reserved */
}

// ─── Fee helpers ──────────────────────────────────────────────────────────────

/// Gacha mint fee escalation curve (plan §4.3, mirrors EVM `mintFee(n) = baseMintFee *
/// 2^min(n, 7)`): doubles per prior mint from this wallet, capped at 128x base after the
/// 7th mint. `base_fee_lamports << 7` cannot overflow `u64` for any sane fee, so no
/// checked/saturating arithmetic is needed.
pub fn mint_fee_for(mint_count: u32, base_fee_lamports: u64) -> u64 {
    base_fee_lamports << mint_count.min(7)
}

/// Level-scaled train fee (plan §3.4, mirrors EVM `GameLogicV1.train`):
/// `trainFee(L) = base_fee * (100 + 2*L) / 100` — 1x at level 1, ~3x at level 100.
/// `100 + 2 * level` is at most ~131_170 (`level: u16`), so only the multiplication by
/// `base_fee_lamports` can overflow `u64`; the division by the constant `100` cannot.
pub fn train_fee_for(level: u16, base_fee_lamports: u64) -> Result<u64> {
    let multiplier = 100u64 + 2 * level as u64;
    let fee = base_fee_lamports
        .checked_mul(multiplier)
        .ok_or(ErrorCode::ArithmeticOverflow)?
        / 100;
    Ok(fee)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    /// Mirrors EVM `mintFee(n) = baseMintFee * 2^min(n, 7)` (plan §4.3).
    #[test]
    fn mint_fee_for_doubles_per_mint_and_caps_at_128x() {
        let base = 20_000_000u64;
        assert_eq!(mint_fee_for(0, base), base);
        assert_eq!(mint_fee_for(1, base), base * 2);
        assert_eq!(mint_fee_for(7, base), base * 128);
        // Counts beyond 7 stay capped at 128x, never shift further.
        assert_eq!(mint_fee_for(8, base), base * 128);
        assert_eq!(mint_fee_for(u32::MAX, base), base * 128);
    }

    /// Mirrors EVM `trainFee(L) = baseFee * (100 + 2*L) / 100` (plan §3.4).
    #[test]
    fn train_fee_for_scales_with_level() {
        let base = 10_000_000u64;
        assert_eq!(train_fee_for(1, base).unwrap(), base * 102 / 100);
        assert_eq!(train_fee_for(100, base).unwrap(), base * 300 / 100);
        assert_eq!(train_fee_for(0, base).unwrap(), base); // 100/100 = 1x
    }
}
