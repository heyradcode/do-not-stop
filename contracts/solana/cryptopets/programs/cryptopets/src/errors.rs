use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Pet name exceeds max length")]
    NameTooLong,
    #[msg("Starter pet already created")]
    StarterAlreadyCreated,
    #[msg("Not authorized to perform this action")]
    Unauthorized,
    #[msg("Program is paused")]
    Paused,
    #[msg("Cannot transfer a pet to yourself")]
    CannotTransferToSelf,
    #[msg("Sender has no pets to transfer")]
    PetCountUnderflow,
    #[msg("Recipient pet count overflow")]
    PetCountOverflow,
    #[msg("Pet is on cooldown")]
    PetNotReady,
    #[msg("Cannot battle the same pet")]
    CannotBattleSelf,
    #[msg("Cannot breed a pet with itself")]
    CannotBreedSelf,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
}

