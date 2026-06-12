use anchor_lang::prelude::*;

use crate::errors::ErrorCode;

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
pub const CURRENT_ACCOUNT_VERSION: u8 = 4;

pub const DEFAULT_BATTLE_COOLDOWN_SECONDS: i64 = 5;

/// Slots a committed Switchboard randomness has to be revealed before `cancel_battle` /
/// `cancel_breed` may close the stuck request (§5: ~150 slots, ~1 minute).
pub const DEFAULT_RANDOMNESS_EXPIRY_SLOTS: u64 = 150;

/// Hard level cap (§6 Solana #4 / mirrors EVM `GameConfig.maxLevel`). Battle wins stop
/// granting levels once a pet reaches this; `level_up` rejects further fee-paid levels too.
pub const DEFAULT_MAX_LEVEL: u16 = 100;

/// Max allowed level gap between battle participants (§3.4, mirrors EVM
/// `GameConfig.levelBandWidth`). 100 effectively disables the check during dev/testing.
pub const DEFAULT_LEVEL_BAND_WIDTH: u16 = 100;

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

/// Bounds enforced by the `set_*` config setters (§5 setter hygiene).
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

/// PDA seed for the lamport-only fee vault (§6 Solana #5). Holds `level_up_fee_lamports`
/// and future protocol fees; swept via `withdraw_fees`.
pub const FEE_VAULT_SEED: &[u8] = b"fee-vault";

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
    pub level_band_width: u16,
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
    pub _reserved: [u8; 8],
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
        + 2 /* level_band_width */
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
        + 8; /* reserved */
}

#[account]
pub struct PlayerProfile {
    pub owner: Pubkey,
    pub pet_count: u16,
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
        + 2 /* pet_count */
        + 1 /* starter_created */
        + 1 /* version */
        + 1 /* bump */
        + 4 /* mint_count */
        + 60; /* reserved */
}

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

#[account]
pub struct PetAccount {
    pub id: u32,
    pub owner: Pubkey,
    pub dna: u64,
    pub rarity: u8,
    pub level: u16,
    pub ready_time: i64,
    pub win_count: u16,
    pub loss_count: u16,
    pub version: u8,
    pub bump: u8,
    pub name: [u8; PetAccount::MAX_NAME_LEN],
    pub name_len: u8,
    /// Interim defender-consent fix (§3.5/§6 Solana #3): when false, this pet cannot be
    /// targeted as a defender in `commit_battle`. Owner-toggleable, defaults to true.
    pub open_to_challenges: bool,
    /// XP toward the next level (§3.4); auto-levels via [`PetAccount::add_xp`] at `100 * level`.
    pub xp: u32,
    /// Most recent opponent's pet id (§3.4 same-opponent decay); `0` = no battles yet, since
    /// `next_pet_id` starts at 1.
    pub last_opponent_id: u32,
    /// Consecutive battles against `last_opponent_id`; halves XP each time via
    /// [`PetAccount::record_battle_opponent`].
    pub same_opponent_streak: u8,
    /// Breeding lineage (plan §4.1/§4.2): `0` = gen-0 (starter mint); otherwise
    /// `max(parent1.generation, parent2.generation) + 1`.
    pub generation: u8,
    /// `0` for gen-0 pets (no parents). `u32` since Solana pet ids are `u32`, unlike
    /// EVM's `uint256`.
    pub parent1_id: u32,
    pub parent2_id: u32,
    /// Times this pet has been used as a breeding parent; will drive the breed
    /// cooldown curve (plan §4.1, not yet wired on Solana).
    pub breed_count: u8,
    /// Breed-specific cooldown, separate from `ready_time`'s battle cooldown (plan
    /// §4.1). `0` = breed-ready immediately.
    pub breed_ready_time: i64,
    /// Train-specific cooldown (plan §3.4). `0` = train-ready immediately; Solana has
    /// no `train` instruction yet.
    pub train_ready_time: i64,
    /// Resolved at mint from DNA + rarity tier (plan §3.7); `0` until species pools
    /// land on Solana.
    pub species_id: u16,
    /// Pet id of this pet's spouse (plan §4.4, mirrors EVM `marriageOf[petId].spouseId`);
    /// `0` = not married, since `next_pet_id` starts at 1.
    pub spouse_id: u32,
    /// Owner of this pet at the time mutual marriage consent was given (plan §4.4,
    /// mirrors EVM `marriageOf[petId].ownerSnapshot`). A transfer afterwards makes the
    /// marriage lazily stale, checked via `is_marriage_valid` / `clear_stale_marriage`.
    pub marriage_owner_snapshot: Pubkey,
    /// Earliest time this pet may marry again after a divorce or stale-marriage cleanup
    /// (plan §4.4, mirrors EVM `marriageCooldownUntil[petId]`).
    pub marriage_cooldown_until: i64,
    pub _reserved: [u8; 8],
}

impl PetAccount {
    pub const SEED: &'static [u8] = b"pet";
    pub const MAX_NAME_LEN: usize = 32;
    pub const SPACE: usize = 8 /* discriminator */
        + 4 /* id */
        + 32 /* owner */
        + 8 /* dna */
        + 1 /* rarity */
        + 2 /* level */
        + 8 /* ready_time */
        + 2 /* win */
        + 2 /* loss */
        + 1 /* version */
        + 1 /* bump */
        + Self::MAX_NAME_LEN /* name */
        + 1 /* name_len */
        + 1 /* open_to_challenges */
        + 4 /* xp */
        + 4 /* last_opponent_id */
        + 1 /* same_opponent_streak */
        + 1 /* generation */
        + 4 /* parent1_id */
        + 4 /* parent2_id */
        + 1 /* breed_count */
        + 8 /* breed_ready_time */
        + 8 /* train_ready_time */
        + 2 /* species_id */
        + 4 /* spouse_id */
        + 32 /* marriage_owner_snapshot */
        + 8 /* marriage_cooldown_until */
        + 8; /* reserved */

    pub fn set_name(&mut self, name: &str) -> Result<()> {
        let bytes = name.as_bytes();
        require!(bytes.len() <= Self::MAX_NAME_LEN, ErrorCode::NameTooLong);
        self.name.fill(0);
        self.name[..bytes.len()].copy_from_slice(bytes);
        self.name_len = bytes.len() as u8;
        Ok(())
    }

    pub fn name(&self) -> String {
        let len = self.name_len as usize;
        String::from_utf8_lossy(&self.name[..len]).to_string()
    }

    pub fn is_ready(&self, now: i64) -> bool {
        now >= self.ready_time
    }

    pub fn trigger_cooldown(&mut self, now: i64, cooldown_seconds: i64) {
        self.ready_time = now.saturating_add(cooldown_seconds);
    }

    /// Breed-specific cooldown check, separate from [`PetAccount::is_ready`]'s battle
    /// cooldown (plan §4.1, mirrors EVM `PetCoreV1.isBreedReady`).
    pub fn is_breed_ready(&self, now: i64) -> bool {
        now >= self.breed_ready_time
    }

    /// Mirrors EVM `PetCoreV1.triggerBreedCooldown` (plan §4.1).
    pub fn trigger_breed_cooldown(&mut self, now: i64, cooldown_seconds: i64) {
        self.breed_ready_time = now.saturating_add(cooldown_seconds);
    }

    /// Train-specific cooldown check, separate from [`PetAccount::is_ready`]'s battle
    /// cooldown and [`PetAccount::is_breed_ready`]'s breed cooldown (plan §3.4, mirrors
    /// EVM `PetCoreV1.isTrainReady`).
    pub fn is_train_ready(&self, now: i64) -> bool {
        now >= self.train_ready_time
    }

    /// Mirrors EVM `PetCoreV1.triggerTrainCooldown` (plan §3.4).
    pub fn trigger_train_cooldown(&mut self, now: i64, cooldown_seconds: i64) {
        self.train_ready_time = now.saturating_add(cooldown_seconds);
    }

    /// Mirrors EVM `PetCoreV1.addXp` (§3.4): a no-op once `level >= max_level`, otherwise
    /// accrues `amount` XP and applies at most one level-up if the `100 * level` threshold
    /// is crossed (leftover XP carries over toward the next level).
    pub fn add_xp(&mut self, amount: u32, max_level: u16) -> Result<()> {
        if self.level >= max_level {
            return Ok(());
        }
        self.xp = self
            .xp
            .checked_add(amount)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
        let threshold = 100u32
            .checked_mul(self.level as u32)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
        if self.xp >= threshold {
            self.xp -= threshold;
            self.level = self
                .level
                .checked_add(1)
                .ok_or(ErrorCode::ArithmeticOverflow)?;
            if self.level > max_level {
                self.level = max_level;
            }
        }
        Ok(())
    }

    /// Mirrors EVM `PetCoreV1.recordBattleOpponent` (§3.4 same-opponent decay): tracks
    /// consecutive battles against `opponent_id` and returns the XP-halving shift to apply
    /// (0 = full XP, 1 = half, 2 = quarter, ...). Facing a different opponent resets the
    /// streak to 0.
    pub fn record_battle_opponent(&mut self, opponent_id: u32) -> u8 {
        if self.last_opponent_id == opponent_id {
            if self.same_opponent_streak < u8::MAX {
                self.same_opponent_streak += 1;
            }
        } else {
            self.last_opponent_id = opponent_id;
            self.same_opponent_streak = 0;
        }
        self.same_opponent_streak
    }

    /// `true` if this pet currently holds a marriage record (plan §4.4, mirrors EVM
    /// `marriageOf[petId].spouseId != 0`).
    pub fn is_married(&self) -> bool {
        self.spouse_id != 0
    }

    /// `true` if this pet may enter a new marriage: not already married and past its
    /// marriage cooldown (plan §4.4, mirrors EVM `proposeMarriage`'s
    /// `marriageOf[petId].spouseId == 0` and `marriageCooldownUntil[petId]` checks).
    pub fn can_marry(&self, now: i64) -> bool {
        !self.is_married() && now >= self.marriage_cooldown_until
    }

    /// Records mutual marriage consent (plan §4.4, mirrors EVM `acceptMarriage`'s write
    /// to `marriageOf[petId]`).
    pub fn set_marriage(&mut self, spouse_id: u32, owner_snapshot: Pubkey) {
        self.spouse_id = spouse_id;
        self.marriage_owner_snapshot = owner_snapshot;
    }

    /// Dissolves this pet's marriage (plan §4.4, mirrors EVM `divorce`/
    /// `clearStaleMarriage`'s deletion of `marriageOf[petId]`). `divorce` additionally
    /// applies a marriage cooldown; `clearStaleMarriage` does not, so the cooldown is
    /// passed in by the caller (`0` for no cooldown).
    pub fn clear_marriage(&mut self, cooldown_until: i64) {
        self.spouse_id = 0;
        self.marriage_owner_snapshot = Pubkey::default();
        self.marriage_cooldown_until = cooldown_until;
    }

    /// `true` if this pet and `spouse` hold mutual, still-valid marriage records whose
    /// owner snapshots match their current owners (plan §4.4, mirrors EVM
    /// `isMarriageValid`).
    pub fn is_marriage_valid_with(&self, spouse: &PetAccount) -> bool {
        self.spouse_id == spouse.id
            && spouse.spouse_id == self.id
            && self.marriage_owner_snapshot == self.owner
            && spouse.marriage_owner_snapshot == spouse.owner
    }
}

/// Pending breed after [`commit_breed`]; closed on [`settle_breed`].
#[account]
pub struct BreedRequest {
    pub owner: Pubkey,
    pub parent1_id: u32,
    pub parent2_id: u32,
    pub child_id: u32,
    pub randomness_account: Pubkey,
    pub commit_slot: u64,
    pub name: [u8; PetAccount::MAX_NAME_LEN],
    pub name_len: u8,
    pub bump: u8,
}

impl BreedRequest {
    pub const SEED: &'static [u8] = b"breed-request";
    pub const SPACE: usize = 8 /* discriminator */
        + 32 /* owner */
        + 4 /* parent1_id */
        + 4 /* parent2_id */
        + 4 /* child_id */
        + 32 /* randomness_account */
        + 8 /* commit_slot */
        + PetAccount::MAX_NAME_LEN
        + 1 /* name_len */
        + 1; /* bump */

    pub fn set_name(&mut self, name: &str) -> Result<()> {
        let bytes = name.as_bytes();
        require!(bytes.len() <= PetAccount::MAX_NAME_LEN, ErrorCode::NameTooLong);
        self.name.fill(0);
        self.name[..bytes.len()].copy_from_slice(bytes);
        self.name_len = bytes.len() as u8;
        Ok(())
    }

    pub fn name(&self) -> String {
        let len = self.name_len as usize;
        String::from_utf8_lossy(&self.name[..len]).to_string()
    }
}

/// Pending battle after [`commit_battle`]; closed on [`settle_battle`].
#[account]
pub struct BattleRequest {
    pub attacker_owner: Pubkey,
    pub defender_owner: Pubkey,
    pub attacker_pet_id: u32,
    pub defender_pet_id: u32,
    pub randomness_account: Pubkey,
    pub commit_slot: u64,
    pub bump: u8,
}

impl BattleRequest {
    pub const SEED: &'static [u8] = b"battle-request";
    pub const SPACE: usize = 8 /* discriminator */
        + 32 /* attacker_owner */
        + 32 /* defender_owner */
        + 4 /* attacker_pet_id */
        + 4 /* defender_pet_id */
        + 32 /* randomness_account */
        + 8 /* commit_slot */
        + 1; /* bump */
}

/// Pending marriage proposal from `pet_a_id`'s owner to `pet_b_id` (plan §4.4, mirrors
/// EVM `marriageProposal[petIdA]`). Created by `propose_marriage`, closed by
/// `accept_marriage` or `cancel_marriage_proposal`. Keyed by `pet_a_id`, so at most one
/// outgoing proposal may be pending per pet.
#[account]
pub struct MarriageProposal {
    pub pet_a_id: u32,
    pub pet_b_id: u32,
    pub proposer: Pubkey,
    pub expiry: i64,
    pub bump: u8,
}

impl MarriageProposal {
    pub const SEED: &'static [u8] = b"marriage-proposal";
    pub const SPACE: usize = 8 /* discriminator */
        + 4 /* pet_a_id */
        + 4 /* pet_b_id */
        + 32 /* proposer */
        + 8 /* expiry */
        + 1; /* bump */

    /// `true` if this proposal is still within its TTL (plan §4.4, mirrors EVM
    /// `acceptMarriage`'s `block.timestamp <= prop.expiry` check).
    pub fn is_live(&self, now: i64) -> bool {
        now <= self.expiry
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fresh_pet() -> PetAccount {
        PetAccount {
            id: 0,
            owner: Pubkey::default(),
            dna: 0,
            rarity: 0,
            level: 0,
            ready_time: 0,
            win_count: 0,
            loss_count: 0,
            version: CURRENT_ACCOUNT_VERSION,
            bump: 0,
            name: [0u8; PetAccount::MAX_NAME_LEN],
            name_len: 0,
            open_to_challenges: true,
            xp: 0,
            last_opponent_id: 0,
            same_opponent_streak: 0,
            generation: 0,
            parent1_id: 0,
            parent2_id: 0,
            breed_count: 0,
            breed_ready_time: 0,
            train_ready_time: 0,
            species_id: 0,
            spouse_id: 0,
            marriage_owner_snapshot: Pubkey::default(),
            marriage_cooldown_until: 0,
            _reserved: [0u8; 8],
        }
    }

    /// Cross-chain golden vectors (plan §3.4, §7), transcribed from
    /// `contracts/test-vectors/xp.json`'s `decaySequences` (kept in sync manually with
    /// `PetCoreV1.recordBattleOpponent` / `XpFormula.test.ts`).
    #[test]
    fn record_battle_opponent_matches_evm_golden_vectors() {
        // (name, opponent_ids, expected_decay_shifts)
        let sequences: &[(&str, &[u32], &[u8])] = &[
            (
                "repeat-then-switch-then-repeat",
                &[5, 5, 5, 7, 5],
                &[0, 1, 2, 0, 0],
            ),
            (
                "switch-twice-then-repeat",
                &[3, 4, 3, 3],
                &[0, 0, 0, 1],
            ),
        ];

        for (name, opponent_ids, expected_shifts) in sequences {
            let mut pet = fresh_pet();
            for (i, (&opponent_id, &expected_shift)) in
                opponent_ids.iter().zip(expected_shifts.iter()).enumerate()
            {
                let shift = pet.record_battle_opponent(opponent_id);
                assert_eq!(shift, expected_shift, "sequence \"{}\" step {}", name, i);
            }
        }
    }

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

    /// Mirrors EVM `marriageOf[petId].spouseId == 0` / `marriageCooldownUntil` checks in
    /// `proposeMarriage` (plan §4.4).
    #[test]
    fn can_marry_requires_unmarried_and_past_cooldown() {
        let mut pet = fresh_pet();
        assert!(pet.can_marry(100));

        pet.marriage_cooldown_until = 200;
        assert!(!pet.can_marry(100));
        assert!(pet.can_marry(200));

        pet.marriage_cooldown_until = 0;
        pet.set_marriage(7, Pubkey::new_unique());
        assert!(!pet.can_marry(100));
    }

    /// Mirrors EVM `acceptMarriage`'s mutual `marriageOf` writes and `isMarriageValid`'s
    /// spouse-id + owner-snapshot checks (plan §4.4).
    #[test]
    fn is_marriage_valid_with_requires_mutual_record_and_matching_owners() {
        let mut a = fresh_pet();
        a.id = 1;
        a.owner = Pubkey::new_unique();
        let mut b = fresh_pet();
        b.id = 2;
        b.owner = Pubkey::new_unique();

        a.set_marriage(b.id, a.owner);
        b.set_marriage(a.id, b.owner);
        assert!(a.is_marriage_valid_with(&b));
        assert!(b.is_marriage_valid_with(&a));

        // Transferring `a` to a new owner invalidates the marriage (stale).
        a.owner = Pubkey::new_unique();
        assert!(!a.is_marriage_valid_with(&b));
    }

    /// Mirrors EVM `divorce`'s `marriageCooldownUntil` writes and deletion of
    /// `marriageOf[petId]` (plan §4.4).
    #[test]
    fn clear_marriage_resets_spouse_and_applies_cooldown() {
        let mut pet = fresh_pet();
        pet.set_marriage(7, Pubkey::new_unique());
        assert!(pet.is_married());

        pet.clear_marriage(500);
        assert!(!pet.is_married());
        assert_eq!(pet.spouse_id, 0);
        assert_eq!(pet.marriage_owner_snapshot, Pubkey::default());
        assert_eq!(pet.marriage_cooldown_until, 500);
    }

    /// Mirrors EVM `acceptMarriage`'s `block.timestamp <= prop.expiry` check (plan §4.4).
    #[test]
    fn marriage_proposal_is_live_until_expiry() {
        let proposal = MarriageProposal {
            pet_a_id: 1,
            pet_b_id: 2,
            proposer: Pubkey::new_unique(),
            expiry: 1_000,
            bump: 0,
        };
        assert!(proposal.is_live(1_000));
        assert!(!proposal.is_live(1_001));
    }
}

