import { getPetProperties, type Pet } from '@shared/core';

export type StatTile = { label: string; value: number };

/**
 * The four stats a pet is shown by, in the order both surfaces draw them.
 *
 * The fourth is VIT, not AGI. Agility has no backing in the data model: `getPetProperties`
 * returns life, attack, defense and intelligence and nothing else, and frontend's own comment
 * records the same substitution. Inventing an AGI number here would make the two clients
 * disagree about a stat neither can source.
 */
export const statTiles = (pet: Pick<Pet, 'dna'>): StatTile[] => {
    const p = getPetProperties(pet);
    return [
        { label: 'STR', value: p.attack },
        { label: 'INT', value: p.intelligence },
        { label: 'DEF', value: p.defense },
        { label: 'VIT', value: p.life },
    ];
};

/**
 * Share of fights won, or `null` for a pet that has never fought.
 *
 * `null` rather than `0`, because zero percent reads as a losing record and never fighting is
 * not losing. Returning the number and letting the caller decide how to say it is what keeps
 * the two surfaces honest: `PetCard` and `PetDetailStrip` each had their own copy of this
 * arithmetic, under different names, disagreeing about the unfought case.
 */
export const winPercent = (pet: Pick<Pet, 'winCount' | 'lossCount'>): number | null => {
    const fought = pet.winCount + pet.lossCount;
    return fought === 0 ? null : Math.round((pet.winCount / fought) * 100);
};
