use anchor_lang::prelude::*;

/// Note: `#[error_code]` numbers these sequentially from 6000, so removing a variant
/// renumbers every one after it.
#[error_code]
pub enum ErrorCode {
    #[msg("Only the admin may perform this action")]
    Unauthorized,
    #[msg("Claims are paused")]
    Paused,
    #[msg("Merkle root must not be zero")]
    EmptyRoot,
    #[msg("Claim window must close after it opens")]
    BadClaimWindow,
    #[msg("Claims for this season have not opened yet")]
    ClaimsNotOpen,
    #[msg("Claims for this season have closed")]
    ClaimsClosed,
    #[msg("Claims for this season are still open")]
    ClaimsStillOpen,
    #[msg("Amount exceeds the per-wallet cap")]
    ExceedsWalletCap,
    #[msg("Amount exceeds what remains of the season cap")]
    ExceedsSeasonCap,
    #[msg("Merkle proof does not prove this entitlement")]
    BadProof,
    #[msg("Proof is longer than any tree this program will verify")]
    ProofTooLong,
    #[msg("Destination token account does not belong to the entitled wallet")]
    WrongTokenOwner,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,

    // Appended, never inserted. `#[error_code]` numbers sequentially from 6000, so adding a
    // variant anywhere but the end renumbers every one after it and silently changes what a
    // client's stored error code means. Free to ignore before the first deploy; not after.
    #[msg("Caps must be greater than zero, or nobody can claim")]
    ZeroCap,
}
