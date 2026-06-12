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
    #[msg("Rarity must be in 1..=5")]
    InvalidRarity,
    #[msg("Breed request already pending for this wallet")]
    BreedRequestAlreadyPending,
    #[msg("No pending breed request for this wallet")]
    BreedRequestNotFound,
    #[msg("Battle request already pending for this wallet")]
    BattleRequestAlreadyPending,
    #[msg("No pending battle request for this wallet")]
    BattleRequestNotFound,
    #[msg("Invalid Switchboard randomness account")]
    InvalidRandomnessAccount,
    #[msg("Switchboard randomness has expired")]
    RandomnessExpired,
    #[msg("Switchboard randomness already revealed")]
    RandomnessAlreadyRevealed,
    #[msg("Switchboard randomness not yet revealed")]
    RandomnessNotResolved,
    #[msg("Battle cooldown exceeds the maximum allowed")]
    InvalidBattleCooldown,
    #[msg("Level-up fee exceeds the maximum allowed")]
    InvalidLevelUpFee,
    #[msg("Fee vault balance is insufficient for this withdrawal")]
    InsufficientFeeVaultBalance,
    #[msg("Randomness expiry slots exceeds the maximum allowed")]
    InvalidRandomnessExpirySlots,
    #[msg("Switchboard randomness has not yet expired")]
    RandomnessNotExpired,
    #[msg("Defender pet is not open to challenges")]
    DefenderNotOpenToChallenges,
    #[msg("Max level must be greater than zero")]
    InvalidMaxLevel,
    #[msg("Pet has already reached the max level")]
    MaxLevelReached,
    #[msg("Battle participants must have different owners")]
    CannotBattleSameOwner,
    #[msg("Level gap between pets exceeds the allowed band")]
    LevelGapTooLarge,
    #[msg("Generation cap must be greater than zero")]
    InvalidGenerationCap,
    #[msg("Breed cooldown base exceeds the maximum allowed")]
    InvalidBreedCooldownBase,
    #[msg("Newborn cooldown exceeds the maximum allowed")]
    InvalidNewbornCooldown,
    #[msg("Pet is on breed cooldown")]
    PetNotBreedReady,
    #[msg("Incest: parent-child breeding rejected")]
    IncestBreedingRejected,
    #[msg("Generation cap reached")]
    GenerationCapReached,
    #[msg("Base mint fee exceeds the maximum allowed")]
    InvalidBaseMintFee,
    #[msg("Train fee exceeds the maximum allowed")]
    InvalidTrainFee,
    #[msg("Train cooldown exceeds the maximum allowed")]
    InvalidTrainCooldown,
    #[msg("Train XP exceeds the maximum allowed")]
    InvalidTrainXp,
    #[msg("Pet is on train cooldown")]
    PetNotTrainReady,
    #[msg("Breed fee exceeds the maximum allowed")]
    InvalidBreedFee,
    #[msg("Stud fee exceeds the maximum allowed")]
    InvalidStudFee,
    #[msg("Marriage cooldown exceeds the maximum allowed")]
    InvalidMarriageCooldown,
    #[msg("Proposal TTL exceeds the maximum allowed")]
    InvalidProposalTtl,
    #[msg("Cannot marry a pet to itself")]
    CannotMarrySelf,
    #[msg("Pets with the same owner do not need to marry")]
    CannotMarrySameOwner,
    #[msg("Pet is already married or on marriage cooldown")]
    PetNotEligibleForMarriage,
    #[msg("Incest: cannot marry a parent or child")]
    IncestMarriageRejected,
    #[msg("A pending marriage proposal already exists for this pet")]
    MarriageProposalAlreadyPending,
    #[msg("No matching marriage proposal found")]
    MarriageProposalNotFound,
    #[msg("Marriage proposal has expired")]
    MarriageProposalExpired,
    #[msg("Proposer no longer owns this pet")]
    MarriageProposerNoLongerOwnsPet,
}

