use anchor_lang::prelude::*;

/// The zero root, which `publish_batch` refuses. It is also `latest_root` before the first
/// batch, so "no batch published yet" and "an empty root was accepted" can never be
/// confused: the second is unreachable.
pub const ZERO_ROOT: [u8; 32] = [0u8; 32];

/// Head of the batch chain, plus the admin and the pause flag. One per deployment.
#[account]
pub struct RegistryState {
    /// May authorize and revoke publishers, pause, and hand the role on. Expected to be a
    /// multisig. Rotating it is the *only* recovery path once the upgrade authority is
    /// burned, which is why `set_admin` exists at all.
    pub admin: Pubkey,
    /// Highest batch number published. `0` before the first batch, which start at 1.
    pub latest_batch_number: u64,
    /// Merkle root of the most recent batch, which the next batch must name.
    pub latest_root: [u8; 32],
    /// `last_sequence` of the most recent batch.
    ///
    /// Denormalized here rather than read back off the previous `Batch` PDA, because the
    /// contiguity check must not depend on an account the caller chose. Passing the
    /// previous batch as an account would let a publisher supply a different one and
    /// present any `first_sequence` as contiguous.
    pub latest_last_sequence: u64,
    pub paused: bool,
    pub bump: u8,
    /// Padding, useful only until the upgrade authority is burned.
    ///
    /// After the burn no code can ever read a new field, so this is dead space rather than
    /// future-proofing: migration means deploying a fresh registry and starting a new chain
    /// of batches, which is visible to everyone rather than silent. It is kept because the
    /// burn happens after the deployed program has been exercised, and 64 bytes of rent on
    /// a single account is a cheap option to hold open until then.
    pub _reserved: [u8; 64],
}

impl RegistryState {
    pub const SEED: &'static [u8] = b"registry";
    pub const SPACE: usize = 8 /* discriminator */
        + 32 /* admin */
        + 8 /* latest_batch_number */
        + 32 /* latest_root */
        + 8 /* latest_last_sequence */
        + 1 /* paused */
        + 1 /* bump */
        + 64; /* reserved */
}

/// Permission to publish, as an account rather than a map entry.
///
/// Existence *is* the permission: `authorize_publisher` creates it and
/// `revoke_publisher` closes it, so there is no `allowed: bool` that could be read stale
/// or left `false` while the account lingers. `publish_batch` requires the account to
/// deserialize, which a closed one cannot.
#[account]
pub struct Publisher {
    /// Redundant with the PDA seed, kept so `getProgramAccounts` can list who is authorized
    /// without deriving every candidate address first.
    pub publisher: Pubkey,
    pub bump: u8,
}

impl Publisher {
    pub const SEED: &'static [u8] = b"publisher";
    pub const SPACE: usize = 8 /* discriminator */
        + 32 /* publisher */
        + 1; /* bump */
}

/// One published batch. Mirrors §I's commitment field list, and `BattleBatchRegistry.sol`'s
/// `Batch` struct, exactly.
///
/// No reserved padding, unlike `RegistryState`. There is one of these per batch forever, so
/// padding is rent paid on every batch for a field that could never be read anyway once the
/// upgrade authority is burned.
#[account]
pub struct Batch {
    pub previous_root: [u8; 32],
    pub merkle_root: [u8; 32],
    /// Hash over the set of ruleset hashes the batched receipts used, so a batch names the
    /// rules its contents were fought under.
    pub ruleset_set_hash: [u8; 32],
    pub first_sequence: u64,
    pub last_sequence: u64,
    /// Cluster time at publication. The operator's own `createdAt` travels in the receipts;
    /// this is when the chain saw it, which is the one nobody can backdate.
    pub published_at: i64,
    pub bump: u8,
}

impl Batch {
    pub const SEED: &'static [u8] = b"batch";
    pub const SPACE: usize = 8 /* discriminator */
        + 32 /* previous_root */
        + 32 /* merkle_root */
        + 32 /* ruleset_set_hash */
        + 8 /* first_sequence */
        + 8 /* last_sequence */
        + 8 /* published_at */
        + 1; /* bump */
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    /// Space constants are hand-summed, and a wrong one is not caught by the type system:
    /// too small fails at runtime on the first write, too large silently overcharges rent
    /// on every account for the life of the program.
    #[test]
    fn space_constants_match_their_field_lists() {
        assert_eq!(RegistryState::SPACE, 8 + 32 + 8 + 32 + 8 + 1 + 1 + 64);
        assert_eq!(Publisher::SPACE, 8 + 32 + 1);
        assert_eq!(Batch::SPACE, 8 + 32 + 32 + 32 + 8 + 8 + 8 + 1);
    }

    #[test]
    fn zero_root_is_all_zero_bytes() {
        assert!(ZERO_ROOT.iter().all(|byte| *byte == 0));
    }
}
