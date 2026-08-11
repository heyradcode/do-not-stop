use anchor_lang::prelude::*;

/// Note: `#[error_code]` numbers these sequentially from 6000, so removing a variant
/// renumbers every one after it. Once this program's upgrade authority is burned the
/// numbering is frozen for good, which is the intent.
#[error_code]
pub enum ErrorCode {
    #[msg("Only the admin may perform this action")]
    Unauthorized,
    #[msg("Publication is paused")]
    Paused,
    #[msg("Batch number must be exactly one past the current head")]
    WrongBatchNumber,
    #[msg("previous_root must name the current head root")]
    WrongPreviousRoot,
    #[msg("Merkle root must not be zero")]
    EmptyRoot,
    #[msg("last_sequence must not precede first_sequence")]
    BadSequenceRange,
    #[msg("first_sequence must continue from the previous batch's last_sequence")]
    SequenceNotContiguous,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
}
