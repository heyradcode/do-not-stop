export interface PetSkill {
    /** Archetype index 0..7 (skill = speciesId % 8). */
    index: number;
    name: string;
    description: string;
}

/**
 * The 8 passive skill archetypes, in the canonical order the combat sim keys
 * off (CombatSimV1 doc comment / plan §3.7). Index = speciesId % 8.
 */
const SKILL_ARCHETYPES: readonly { name: string; description: string }[] = [
    { name: 'Tank',      description: 'Boosted HP pool before battle.' },
    { name: 'Shell',     description: 'Higher DEF, but always strikes second.' },
    { name: 'Swift',     description: 'Wins initiative ties and gets bonus crit.' },
    { name: 'Cunning',   description: 'Raised critical-hit cap.' },
    { name: 'Fury',      description: 'Extra damage while below the HP threshold.' },
    { name: 'Sage',      description: 'Higher MDEF; magic ignores the element penalty.' },
    { name: 'Rebirth',   description: 'Survives one killing blow at 1 HP per battle.' },
    { name: 'Bloodlust', description: 'Heals a share of physical damage dealt.' },
];

/**
 * Resolve a pet's passive skill archetype from its `speciesId`
 * (`skill = speciesId % 8`). Returns null when species is unknown
 * (v1 / Solana pets that don't surface speciesId).
 */
export const getPetSkill = (speciesId: number | undefined): PetSkill | null => {
    if (speciesId == null) return null;
    const index = ((Math.trunc(speciesId) % 8) + 8) % 8;
    const archetype = SKILL_ARCHETYPES[index];
    return { index, name: archetype.name, description: archetype.description };
};
