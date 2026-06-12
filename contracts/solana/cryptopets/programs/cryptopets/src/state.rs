use anchor_lang::prelude::*;

use crate::errors::ErrorCode;

/// Account layout version for newly written accounts. Bump when adding fields that
/// consume `_reserved` space, so off-chain readers can detect the layout in use.
pub const CURRENT_ACCOUNT_VERSION: u8 = 1;

pub const DEFAULT_BATTLE_COOLDOWN_SECONDS: i64 = 5;
pub const DEFAULT_ATTACK_VICTORY_PROBABILITY: u8 = 70;

/// Slots a committed Switchboard randomness has to be revealed before `cancel_battle` /
/// `cancel_breed` may close the stuck request (§5: ~150 slots, ~1 minute).
pub const DEFAULT_RANDOMNESS_EXPIRY_SLOTS: u64 = 150;

/// Bounds enforced by the `set_*` config setters (§5 setter hygiene).
pub const MAX_BATTLE_COOLDOWN_SECONDS: i64 = 7 * 24 * 60 * 60;
pub const MAX_LEVEL_UP_FEE_LAMPORTS: u64 = 1_000_000_000; // 1 SOL
pub const MAX_RANDOMNESS_EXPIRY_SLOTS: u64 = 1_512_000; // ~7 days at 400ms/slot

/// PDA seed for the lamport-only fee vault (§6 Solana #5). Holds `level_up_fee_lamports`
/// and future protocol fees; swept via `withdraw_fees`.
pub const FEE_VAULT_SEED: &[u8] = b"fee-vault";

#[account]
pub struct GlobalState {
    pub admin: Pubkey,
    pub level_up_fee_lamports: u64,
    pub battle_cooldown_seconds: i64,
    pub attack_victory_probability: u8,
    pub next_pet_id: u32,
    pub paused: bool,
    pub version: u8,
    pub bump: u8,
    pub randomness_expiry_slots: u64,
    pub _reserved: [u8; 56],
}

impl GlobalState {
    pub const SEED: &'static [u8] = b"global-state";
    pub const SPACE: usize = 8 /* discriminator */
        + 32 /* admin */
        + 8 /* level_up_fee_lamports */
        + 8 /* battle_cooldown_seconds */
        + 1 /* attack_victory_probability */
        + 4 /* next_pet_id */
        + 1 /* paused */
        + 1 /* version */
        + 1 /* bump */
        + 8 /* randomness_expiry_slots */
        + 56; /* reserved */
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
    pub _reserved: [u8; 31],
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
        + 31; /* reserved */

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

