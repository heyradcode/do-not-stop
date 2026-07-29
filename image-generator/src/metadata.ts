/**
 * ERC-721 metadata document. Shape follows the OpenSea metadata standard, which
 * is what every marketplace and wallet actually reads.
 *
 * Split into visual attributes (fixed for the life of the pet, derived from DNA)
 * and progress attributes (level, record, which change as the pet is played).
 * Only the visual half determines the image, so a pet levelling up must not
 * change its art; putting both in one document is fine, but the distinction is
 * why `level` is absent from the image cache key.
 */

import type { OnChainPet } from './chain.js';
import { summarisePet } from './prompt.js';
import { derivePetVisualTraits, describePetVisualTraits } from './traits.js';

export interface MetadataAttribute {
    trait_type: string;
    value: string | number;
    display_type?: string;
}

export interface PetMetadata {
    name: string;
    description: string;
    image: string;
    external_url?: string;
    attributes: MetadataAttribute[];
}

export interface MetadataOptions {
    /** Absolute URL of the pet's image. */
    imageUrl: string;
    /** Optional link to the pet's page in the game. */
    externalUrl?: string;
}

export const buildPetMetadata = (pet: OnChainPet, options: MetadataOptions): PetMetadata => {
    const traits = derivePetVisualTraits({
        dna: pet.dna,
        rarity: pet.rarity,
        speciesId: pet.speciesId,
    });

    const attributes: MetadataAttribute[] = [
        ...describePetVisualTraits(traits).map((t) => ({ trait_type: t.trait, value: t.value })),
        { trait_type: 'Level', value: pet.level, display_type: 'number' },
        { trait_type: 'Generation', value: pet.generation, display_type: 'number' },
        { trait_type: 'Wins', value: pet.winCount, display_type: 'number' },
        { trait_type: 'Losses', value: pet.lossCount, display_type: 'number' },
    ];

    return {
        name: pet.name || `Pet #${pet.tokenId}`,
        description: summarisePet(traits),
        image: options.imageUrl,
        ...(options.externalUrl ? { external_url: options.externalUrl } : {}),
        attributes,
    };
};
