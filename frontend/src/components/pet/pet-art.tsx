import React, { useState } from 'react';
import { getPetAvatar, type Pet } from '@shared/core';

/**
 * A pet's generated art, falling back to its emoji avatar.
 *
 * Progressive enhancement on purpose. The emoji is what shipped and what every
 * pet has; the image is an improvement layered on top when three things hold:
 * `VITE_IMAGE_SERVICE_URL` is configured, the pet has an identifier the service
 * can resolve, and the image actually loads. Any of those failing leaves the UI
 * exactly as it was rather than showing a broken frame.
 *
 * The emoji also covers the first-ever request for a pet, which is slow: art is
 * generated on demand and the response can take seconds. Showing the emoji until
 * the image arrives beats an empty box.
 *
 * Sizing is inherited, not declared: the image is 1em square, so it matches
 * whatever font-size the surrounding avatar style already sets, and no CSS
 * changes anywhere.
 */

const SERVICE_URL: string | undefined = import.meta.env.VITE_IMAGE_SERVICE_URL;

/**
 * Pets are addressed differently per chain, matching the service's routes:
 * a numeric id on EVM, the Metaplex Core asset pubkey on Solana. A Solana pet
 * without an assetKey has nothing to look up, so it keeps the emoji.
 */
export const petArtUrl = (pet: Pick<Pet, 'id' | 'chain' | 'assetKey'>): string | null => {
    if (!SERVICE_URL) return null;

    const identifier = pet.chain === 'solana' ? pet.assetKey : pet.id;
    if (!identifier) return null;

    return `${SERVICE_URL.replace(/\/+$/, '')}/image/${pet.chain}/${identifier}.png`;
};

type PetArtProps = {
    pet: Pick<Pet, 'id' | 'chain' | 'assetKey' | 'dna' | 'name'>;
};

const PetArt: React.FC<PetArtProps> = ({ pet }) => {
    const [failed, setFailed] = useState(false);
    const [loaded, setLoaded] = useState(false);

    const url = petArtUrl(pet);
    const emoji = getPetAvatar(pet.dna);

    if (!url || failed) return <>{emoji}</>;

    return (
        <>
            {loaded ? null : emoji}
            <img
                src={url}
                alt={pet.name}
                // A gallery mounts every card at once, and on a cold cache each
                // miss is a generation queued behind the service's concurrency
                // limit. Lazy loading means only pets actually on screen ask for
                // art, which is the difference between a handful of requests and
                // one per pet in the collection.
                loading="lazy"
                decoding="async"
                onLoad={() => setLoaded(true)}
                onError={() => setFailed(true)}
                style={{
                    width: '1em',
                    height: '1em',
                    objectFit: 'contain',
                    display: loaded ? 'block' : 'none',
                }}
            />
        </>
    );
};

export default PetArt;
