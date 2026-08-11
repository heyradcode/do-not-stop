use anchor_lang::prelude::*;

/// Admin and the global pause. One per deployment.
#[account]
pub struct RewardsState {
    /// Opens seasons, pauses claims, sweeps what a closed season never paid, and can hand
    /// the role on. Expected to be a multisig.
    pub admin: Pubkey,
    /// Blocks `claim` only. Opening and sweeping stay available, because a pause is a
    /// response to a suspected bad root and the fix for that is administrative.
    pub paused: bool,
    pub bump: u8,
    pub _reserved: [u8; 64],
}

impl RewardsState {
    pub const SEED: &'static [u8] = b"rewards";
    pub const SPACE: usize = 8 /* discriminator */
        + 32 /* admin */
        + 1 /* paused */
        + 1 /* bump */
        + 64; /* reserved */
}

/// One reward season: its root, its caps, and its window.
///
/// A season is opened once and never edited. Re-posting a root would let the operator
/// rewrite entitlements after people had read them, which is the single most valuable thing
/// an attacker holding the admin key could do, so it is not possible even for the admin. A
/// mistaken root is corrected by opening a new season, visibly.
#[account]
pub struct Season {
    pub merkle_root: [u8; 32],
    /// SPL mint this season pays in. Also the `token` field of every leaf in its tree.
    pub mint: Pubkey,
    /// 32-byte identity of the cluster, which belongs in every leaf so a proof built for
    /// devnet is not in a mainnet tree.
    ///
    /// Admin-supplied at open time, because Solana has no `block.chainid`: no syscall
    /// exposes the cluster, and the same program id can be deployed to several. Storing it
    /// here rather than accepting it per claim is what keeps it out of claimant control,
    /// which is the property that actually matters. The intended value is the cluster's
    /// genesis hash.
    pub chain_ref: [u8; 32],
    /// Most any single wallet may claim. Bounds the damage of one bad leaf.
    pub per_wallet_cap: u64,
    /// Most the whole season may pay out. Bounds the damage of one bad root.
    pub season_cap: u64,
    pub total_claimed: u64,
    pub claims_open_at: i64,
    pub claims_close_at: i64,
    pub bump: u8,
    pub _reserved: [u8; 64],
}

impl Season {
    pub const SEED: &'static [u8] = b"season";
    pub const VAULT_SEED: &'static [u8] = b"vault";
    pub const SPACE: usize = 8 /* discriminator */
        + 32 /* merkle_root */
        + 32 /* mint */
        + 32 /* chain_ref */
        + 8 /* per_wallet_cap */
        + 8 /* season_cap */
        + 8 /* total_claimed */
        + 8 /* claims_open_at */
        + 8 /* claims_close_at */
        + 1 /* bump */
        + 64; /* reserved */
}

/// One wallet's claim in one season.
///
/// Its **existence** is the nullifier. Deriving the address from the season and the wallet
/// is what stops a claimant choosing their own, and `init` is what stops a second claim: no
/// stored flag to read stale, and no way to reset it short of closing the account, which
/// nothing does.
#[account]
pub struct Claimed {
    pub bump: u8,
}

impl Claimed {
    pub const SEED: &'static [u8] = b"claim";
    pub const SPACE: usize = 8 /* discriminator */ + 1; /* bump */
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    /// Hand-summed constants: too small fails at runtime on the first write, too large
    /// silently overcharges rent on every account for the life of the program.
    #[test]
    fn space_constants_match_their_field_lists() {
        assert_eq!(RewardsState::SPACE, 8 + 32 + 1 + 1 + 64);
        assert_eq!(Season::SPACE, 8 + 32 + 32 + 32 + 8 + 8 + 8 + 8 + 8 + 1 + 64);
        assert_eq!(Claimed::SPACE, 8 + 1);
    }
}
