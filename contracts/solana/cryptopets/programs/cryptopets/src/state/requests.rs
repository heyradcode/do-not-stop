use anchor_lang::prelude::*;

use crate::{errors::ErrorCode, state::pet::PetAccount};

// ─── BreedRequest ─────────────────────────────────────────────────────────────

/// Pending breed after [`commit_breed`]; closed on [`settle_breed`].
#[account]
pub struct BreedRequest {
    pub owner: Pubkey,
    pub parent1_id: u32,
    pub parent2_id: u32,
    /// Provisional child id (`next_pet_id` at commit time), recorded for the commit
    /// event. The final id is assigned at `settle_breed` from the then-current
    /// `next_pet_id` (mirrors EVM `settleBreed`'s `createPet`), so it may differ if
    /// other mints/breeds settle in between; `BredEvent.child_id` is authoritative.
    pub child_id: u32,
    pub randomness_account: Pubkey,
    pub commit_slot: u64,
    pub name: [u8; PetAccount::MAX_NAME_LEN],
    pub name_len: u8,
    pub bump: u8,
    /// Stud fee escrowed for a cross-owner breed (plan §4.4, mirrors EVM
    /// `BreedRequest.studFee`); `0` for same-owner breeds.
    pub stud_fee: u64,
    /// Recipient of `stud_fee` if the breed settles, or refund destination if it's
    /// cancelled (plan §4.4, mirrors EVM `BreedRequest.otherOwner`);
    /// `Pubkey::default()` for same-owner breeds.
    pub other_owner: Pubkey,
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
        + 1 /* bump */
        + 8 /* stud_fee */
        + 32; /* other_owner */

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

// ─── BattleRequest ────────────────────────────────────────────────────────────

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

// ─── MintRequest ──────────────────────────────────────────────────────────────

/// Pending gacha mint after [`commit_mint`]; closed on [`settle_mint`] or
/// [`cancel_mint`] (plan §4.3). Mirrors [`BreedRequest`]'s commit/settle/cancel shape,
/// but with no parent pets — the minted pet's DNA is derived purely from the revealed
/// VRF value.
#[account]
pub struct MintRequest {
    pub owner: Pubkey,
    /// Provisional pet id (`next_pet_id` at commit time), recorded for the commit
    /// event. The final id is assigned at `settle_mint` from the then-current
    /// `next_pet_id`, so it may differ if other mints/breeds settle in between;
    /// `MintedEvent.pet_id` is authoritative.
    pub pet_id: u32,
    pub randomness_account: Pubkey,
    pub commit_slot: u64,
    pub name: [u8; PetAccount::MAX_NAME_LEN],
    pub name_len: u8,
    pub bump: u8,
}

impl MintRequest {
    pub const SEED: &'static [u8] = b"mint-request";
    pub const SPACE: usize = 8 /* discriminator */
        + 32 /* owner */
        + 4 /* pet_id */
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
