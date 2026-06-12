use anchor_lang::prelude::*;

use crate::errors::ErrorCode;

/// Account layout version for newly written accounts. Bump when adding fields that
/// consume `_reserved` space, so off-chain readers can detect the layout in use.
///
/// v2: Phase 3 data model (plan §4/§9.1) — adds `generation`, `parent1_id`,
/// `parent2_id`, `breed_count`, `breed_ready_time`, `train_ready_time`, `species_id`
/// to `PetAccount` and bumps `PetAccount::SPACE`. Breaking; requires redeploy + reindex.
pub const CURRENT_ACCOUNT_VERSION: u8 = 2;

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

/// Bounds enforced by the `set_*` config setters (§5 setter hygiene).
pub const MAX_BATTLE_COOLDOWN_SECONDS: i64 = 7 * 24 * 60 * 60;
pub const MAX_LEVEL_UP_FEE_LAMPORTS: u64 = 1_000_000_000; // 1 SOL
pub const MAX_RANDOMNESS_EXPIRY_SLOTS: u64 = 1_512_000; // ~7 days at 400ms/slot
pub const MAX_GENERATION_CAP: u8 = 100;
pub const MAX_BREED_COOLDOWN_BASE_SECONDS: i64 = BREED_COOLDOWN_CAP_SECONDS;
pub const MAX_NEWBORN_COOLDOWN_SECONDS: i64 = 7 * 24 * 60 * 60;

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
    pub _reserved: [u8; 36],
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
        + 36; /* reserved */
}

#[account]
pub struct PlayerProfile {
    pub owner: Pubkey,
    pub pet_count: u16,
    pub starter_created: bool,
    pub version: u8,
    pub bump: u8,
    pub _reserved: [u8; 64],
}

impl PlayerProfile {
    pub const SEED: &'static [u8] = b"player-profile";
    pub const SPACE: usize = 8 /* discriminator */
        + 32 /* owner */
        + 2 /* pet_count */
        + 1 /* starter_created */
        + 1 /* version */
        + 1 /* bump */
        + 64; /* reserved */
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
    pub _reserved: [u8; 22],
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
        + 22; /* reserved */

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
            _reserved: [0u8; 22],
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
}

