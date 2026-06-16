use anchor_lang::prelude::*;

use crate::errors::ErrorCode;

#[account]
pub struct PetAccount {
    pub id: u32,
    /// Owner at the time this pet was minted or bred (plan §2.3/v2.1 Phase A).
    /// Informational only — post-mint Core-wallet transfers do not update this field
    /// (there is no `transfer_pet` instruction). Current ownership is the Metaplex Core
    /// asset's `owner` field, read via `utils::metadata::core_asset_owner(&asset_account)`.
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
    /// Owner of this pet's Metaplex Core asset at the time mutual marriage consent was
    /// given (plan §4.4, mirrors EVM `marriageOf[petId].ownerSnapshot`), captured via
    /// `utils::metadata::core_asset_owner` in `accept_marriage`. A later Core-asset transfer
    /// makes the marriage lazily stale, detected by `clear_stale_marriage` comparing
    /// this snapshot against the asset's current `core_asset_owner`.
    pub marriage_owner_snapshot: Pubkey,
    /// Earliest time this pet may marry again after a divorce or stale-marriage cleanup
    /// (plan §4.4, mirrors EVM `marriageCooldownUntil[petId]`).
    pub marriage_cooldown_until: i64,
    /// Metaplex Core asset pubkey for this pet (plan §2.3/v2.1 Phase A), minted into the
    /// "CryptoPets" collection by `settle_mint`/`settle_breed`. `Pubkey::default()` until
    /// the CPI mint paths land. Will become this account's PDA seed and the source of
    /// truth for ownership in a follow-up step.
    pub asset: Pubkey,
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
        + 32 /* asset */
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

    /// Dissolves this pet's marriage and applies a marriage cooldown (plan §4.4, mirrors
    /// EVM `divorce`'s deletion of `marriageOf[petId]` plus its
    /// `marriageCooldownUntil[petId]` write).
    pub fn clear_marriage(&mut self, cooldown_until: i64) {
        self.spouse_id = 0;
        self.marriage_owner_snapshot = Pubkey::default();
        self.marriage_cooldown_until = cooldown_until;
    }

    /// Dissolves this pet's marriage without applying a marriage cooldown (plan §4.4,
    /// mirrors EVM `clearStaleMarriage`'s deletion of `marriageOf[petId]`, which leaves
    /// `marriageCooldownUntil[petId]` untouched).
    pub fn clear_stale_marriage(&mut self) {
        self.spouse_id = 0;
        self.marriage_owner_snapshot = Pubkey::default();
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::CURRENT_ACCOUNT_VERSION;

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
            asset: Pubkey::default(),
            _reserved: [0u8; 8],
        }
    }

    /// Cross-chain golden vectors (plan §3.4, §7), transcribed from
    /// `contracts/test-vectors/xp.json`'s `decaySequences` (kept in sync manually with
    /// `PetCoreV1.recordBattleOpponent` / `XpFormula.test.ts`).
    #[test]
    fn record_battle_opponent_matches_evm_golden_vectors() {
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

    /// Mirrors EVM `clearStaleMarriage`'s deletion of `marriageOf[petId]`, which leaves
    /// `marriageCooldownUntil[petId]` untouched (plan §4.4).
    #[test]
    fn clear_stale_marriage_resets_spouse_without_cooldown() {
        let mut pet = fresh_pet();
        pet.marriage_cooldown_until = 42;
        pet.set_marriage(7, Pubkey::new_unique());
        assert!(pet.is_married());

        pet.clear_stale_marriage();
        assert!(!pet.is_married());
        assert_eq!(pet.spouse_id, 0);
        assert_eq!(pet.marriage_owner_snapshot, Pubkey::default());
        assert_eq!(pet.marriage_cooldown_until, 42);
    }
}
