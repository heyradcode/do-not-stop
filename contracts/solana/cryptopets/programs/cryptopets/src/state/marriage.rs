use anchor_lang::prelude::*;

// ─── MarriageProposal ─────────────────────────────────────────────────────────

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

// ─── StudFeeAccount ───────────────────────────────────────────────────────────

/// Pending stud fees owed to `owner` from cross-owner breed settlements (plan §4.4,
/// mirrors EVM `pendingStudFees[address]`), released as a pull payment via
/// `withdraw_stud_fees`. Lamport invariant: balance = rent-exempt minimum + `amount`
/// (withdrawable, credited at `settle_breed` like EVM's `pendingStudFees`) + the
/// pending escrows of any un-settled cross-owner breeds (parked by `commit_breed`,
/// uncounted in `amount` until settle, refunded by `cancel_breed`).
#[account]
pub struct StudFeeAccount {
    pub owner: Pubkey,
    pub amount: u64,
    pub bump: u8,
}

impl StudFeeAccount {
    pub const SEED: &'static [u8] = b"stud-fee";
    pub const SPACE: usize = 8 /* discriminator */
        + 32 /* owner */
        + 8 /* amount */
        + 1; /* bump */
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

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
