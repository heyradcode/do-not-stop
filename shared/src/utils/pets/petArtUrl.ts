import type { Pet } from '../../types/pet';

/** The fields the image service needs to address a pet. */
export type PetArtIdentity = Pick<Pet, 'id' | 'chain' | 'assetKey'>;

/**
 * URL of a pet's generated art on the image service, or `null` when the pet
 * cannot be addressed there.
 *
 * `serviceUrl` is passed in rather than read from the environment, because the
 * two callers read it differently: the web app gets `VITE_IMAGE_SERVICE_URL`
 * from `import.meta.env`, the mobile app gets `IMAGE_SERVICE_URL` from `@env`.
 * Keeping the environment read at the edge leaves this a pure function that
 * both platforms share, so the route shape is written down once.
 *
 * Pets are addressed differently per chain, matching the service's routes: a
 * numeric id on EVM, the Metaplex Core asset pubkey on Solana. A Solana pet
 * without an `assetKey` has nothing to look up, so it gets no URL.
 */
export const petArtUrl = (pet: PetArtIdentity, serviceUrl: string | undefined): string | null => {
    if (!serviceUrl) return null;

    const identifier = pet.chain === 'solana' ? pet.assetKey : pet.id;
    if (!identifier) return null;

    return `${serviceUrl.replace(/\/+$/, '')}/image/${pet.chain}/${identifier}.png`;
};
