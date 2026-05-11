use anchor_lang::prelude::*;

use crate::errors::ErrorCode;

#[account]
pub struct GlobalState {
    pub admin: Pubkey,
    pub level_up_fee_lamports: u64,
    pub next_zombie_id: u32,
    pub paused: bool,
    pub bump: u8,
    pub _reserved: [u8; 2],
}

impl GlobalState {
    pub const SEED: &'static [u8] = b"global-state";
    pub const SPACE: usize = 8 /* discriminator */
        + 32 /* admin */
        + 8 /* level_up_fee */
        + 4 /* next_zombie_id */
        + 1 /* paused */
        + 1 /* bump */
        + 2; /* reserved */
}

#[account]
pub struct PlayerProfile {
    pub owner: Pubkey,
    pub zombie_count: u16,
    pub starter_created: bool,
    pub bump: u8,
    pub _reserved: [u8; 4],
}

impl PlayerProfile {
    pub const SEED: &'static [u8] = b"player-profile";
    pub const SPACE: usize = 8 /* discriminator */
        + 32 /* owner */
        + 2 /* zombie_count */
        + 1 /* starter_created */
        + 1 /* bump */
        + 4; /* reserved */
}

#[account]
pub struct ZombieAccount {
    pub id: u32,
    pub owner: Pubkey,
    pub dna: u64,
    pub rarity: u8,
    pub level: u16,
    pub ready_time: i64,
    pub win_count: u16,
    pub loss_count: u16,
    pub bump: u8,
    pub name: [u8; ZombieAccount::MAX_NAME_LEN],
    pub name_len: u8,
}

impl ZombieAccount {
    pub const SEED: &'static [u8] = b"zombie";
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
        + 1 /* bump */
        + Self::MAX_NAME_LEN /* name */
        + 1; /* name_len */

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
}

