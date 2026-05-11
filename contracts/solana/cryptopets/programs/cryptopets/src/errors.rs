use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Zombie name exceeds max length")]
    NameTooLong,
    #[msg("Starter zombie already created")]
    StarterAlreadyCreated,
    #[msg("Not authorized to perform this action")]
    Unauthorized,
    #[msg("Program is paused")]
    Paused,
}

