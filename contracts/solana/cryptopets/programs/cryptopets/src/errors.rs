use anchor_lang::prelude::*;

/// Note: `#[error_code]` numbers these sequentially from 6000, so removing a variant
/// renumbers every one after it. The battle-request variants were dropped when the
/// on-chain battle path was retired (§L Phase 6), which shifted the codes below them.
#[error_code]
pub enum ErrorCode {
    #[msg("Pet name exceeds max length")]
    NameTooLong,
    #[msg("Not authorized to perform this action")]
    Unauthorized,
    #[msg("Program is paused")]
    Paused,
    #[msg("Pet is on cooldown")]
    PetNotReady,
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
    #[msg("Level-up fee is invalid")]
    InvalidLevelUpFee,
    #[msg("Fee vault balance is insufficient for this withdrawal")]
    InsufficientFeeVaultBalance,
    #[msg("Randomness expiry slots exceeds the maximum allowed")]
    InvalidRandomnessExpirySlots,
    #[msg("Switchboard randomness has not yet expired")]
    RandomnessNotExpired,
    #[msg("Max level must be greater than zero")]
    InvalidMaxLevel,
    #[msg("Pet has already reached the max level")]
    MaxLevelReached,
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
    #[msg("Not the proposer of this marriage proposal")]
    NotMarriageProposer,
    #[msg("Pet is not married")]
    NotMarried,
    #[msg("Pets are not married to each other")]
    NotMarriedToEachOther,
    #[msg("Marriage is not stale")]
    MarriageNotStale,
    #[msg("Pets are not married")]
    PetsNotMarried,
    #[msg("Stud-fee account does not match the expected PDA for the breed request's other owner")]
    InvalidStudFeeAccount,
    #[msg("No stud fees to withdraw")]
    NoStudFeesToWithdraw,
    #[msg("No pending mint request for this wallet")]
    MintRequestNotFound,
    #[msg("Asset account does not match this pet's Metaplex Core asset")]
    InvalidPetAsset,
    #[msg("Cannot transfer a married pet; divorce first")]
    CannotTransferMarriedPet,

    // ─── Inventory (roadmap §4) ───────────────────────────────────────────────
    //
    // Appended, never inserted. `#[error_code]` numbers sequentially from 6000, so adding a
    // variant anywhere but the end renumbers every one after it and silently changes what a
    // client's stored error code means.
    #[msg("Item type 0 is reserved and cannot be catalogued or minted")]
    ItemTypeReserved,
    #[msg("Unknown equip slot")]
    UnknownSlot,
    #[msg("Quantity must be greater than zero")]
    ZeroQuantity,
    #[msg("Not enough of this item")]
    InsufficientItems,
    #[msg("This item is not equipment")]
    NotEquippable,
    #[msg("This item does not go in that slot")]
    WrongSlot,
    #[msg("That slot already holds an item")]
    SlotAlreadyFilled,
    #[msg("That slot is empty")]
    SlotEmpty,
    #[msg("Cannot transfer a pet with equipment; unequip first")]
    CannotTransferGearedPet,
}

