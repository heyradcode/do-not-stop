import type { DialoguePetInput } from '../hooks/battle/useBattleDialogue';
import type { OpponentPet, Pet } from '../types/pet';

/** Map a pet/opponent to the persona input the dialogue endpoint expects. */
export const toDialoguePet = (pet: Pet | OpponentPet): DialoguePetInput => ({
    petId: pet.id,
    name: pet.name,
    level: pet.level,
    rarity: pet.rarity,
    dna: pet.dna.toString(),
    winCount: pet.winCount,
    lossCount: pet.lossCount,
});

/** Personas captured at battle start, reused for the settle dialogue read. */
export type BattlePersonas = { attacker: DialoguePetInput; defender: DialoguePetInput };
