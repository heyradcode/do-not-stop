/** 8-byte discriminator + 4-byte `id` field before `owner` in on-chain `PetAccount`. */
export const PET_ACCOUNT_OWNER_MEMCMP_OFFSET = 12;

/** 8-byte discriminator; `id` (u32) is the very first field in `PetAccount`. */
export const PET_ACCOUNT_ID_MEMCMP_OFFSET = 8;

/** Metaplex Core program address (stable across mainnet / devnet / localnet). */
export const MPL_CORE_PROGRAM_ID = 'CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d';
