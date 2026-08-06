export { mapEvmPet, type EvmRawPet } from './mapEvmPet';
export { mapSolanaPet, type SolanaPetAccountRow } from './mapSolanaPet';
export { getRarityColor, getRarityName, isPetReadyAt } from './cosmetics';
export { getPetSkill, type PetSkill } from './skills';
export { petArtUrl, type PetArtIdentity } from './petArtUrl';
export { getReadyPets as getReadyPetsUnified, type ReadyPet } from './readyPets';
export { NoActiveChainError } from './errors';

/**
 * Canonical wallet-address normalization, re-exported from the MIT protocol package so
 * clients compare accounts the same way the backend groups and hashes them.
 *
 * Shape-based, so it needs no chain argument: EVM addresses fold to lowercase, base58
 * Solana pubkeys pass through untouched. Comparing two accounts with `toLowerCase()`
 * instead would let two distinct Solana pubkeys read as the same player.
 */
export { normalizeAccount } from '@cryptopets/protocol';
