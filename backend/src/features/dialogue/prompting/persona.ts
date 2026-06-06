import type { PetPersonaInput } from '../dialogue.types';

/**
 * Derive a battle persona from a pet's on-chain attributes. Element/class use the
 * same `dna % 6` mapping as the frontend pet card
 * (`shared/src/utils/ethereum/petCard.ts`) so the dialogue stays consistent with
 * what players see. The pet `name` is deliberately NOT baked into the rendered
 * text — it's passed separately as untrusted data (see prompt builder) to avoid
 * prompt injection.
 */

// Keep these arrays in lockstep with petCard.ts.
const ELEMENTS = ['fire', 'water', 'electric', 'nature', 'shadow', 'cosmic'] as const;
const CLASSES = ['Fire Fox', 'Water Dragon', 'Electric Cat', 'Nature Beast', 'Shadow Hound', 'Cosmic Owl'] as const;
const RARITY_NAMES: Record<number, string> = {
    1: 'Common',
    2: 'Uncommon',
    3: 'Rare',
    4: 'Epic',
    5: 'Legendary',
};

const ELEMENT_TONE: Record<string, string> = {
    fire: 'hot-headed and aggressive',
    water: 'cool, flowing, and sly',
    electric: 'hyper and fast-talking',
    nature: 'grounded and patient',
    shadow: 'brooding and menacing',
    cosmic: 'aloof and cryptic',
};

export interface Persona {
    petId: string;
    element: string;
    petClass: string;
    rarity: string;
    level: number;
    record: string;
    temperament: string;
}

function dnaIndex(dna: string, mod: number): number {
    try {
        return Number(((BigInt(dna) % BigInt(mod)) + BigInt(mod)) % BigInt(mod));
    } catch {
        return 0;
    }
}

function levelTier(level: number): string {
    if (level >= 8) return 'veteran';
    if (level >= 3) return 'seasoned fighter';
    return 'rookie';
}

function recordSwagger(winCount: number, lossCount: number): string {
    if (winCount === 0 && lossCount === 0) return 'untested but eager to prove itself';
    if (winCount > lossCount * 2) return 'supremely confident';
    if (winCount > lossCount) return 'self-assured';
    if (winCount === lossCount) return 'even-tempered with something to prove';
    return 'an underdog with a chip on its shoulder';
}

export function buildPersona(pet: PetPersonaInput): Persona {
    const element = ELEMENTS[dnaIndex(pet.dna, ELEMENTS.length)] ?? ELEMENTS[0];
    const petClass = CLASSES[dnaIndex(pet.dna, CLASSES.length)] ?? CLASSES[0];
    const tone = ELEMENT_TONE[element] ?? 'spirited';

    return {
        petId: pet.petId,
        element,
        petClass,
        rarity: RARITY_NAMES[pet.rarity] ?? 'Unknown',
        level: pet.level,
        record: `${pet.winCount}W/${pet.lossCount}L`,
        temperament: `${tone}; ${recordSwagger(pet.winCount, pet.lossCount)} ${levelTier(pet.level)}`,
    };
}

/** Compact persona fragment for the prompt — excludes the pet name by design. */
export function renderPersona(p: Persona): string {
    return `${p.element} ${p.petClass}, ${p.rarity}, level ${p.level}, record ${p.record}. ${p.temperament}.`;
}
