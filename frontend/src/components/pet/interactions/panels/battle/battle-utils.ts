import type { DialoguePetInput, OpponentPet, Pet } from '@shared/core';

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

/** Stable select value for an opponent (pet ids are not globally unique on Solana). */
export const opponentKey = (owner: string, id: string) => `${owner}::${id}`;

export const shortAddress = (addr: string) =>
    addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;

export const VALIDATION_MESSAGE = 'Please select your pet and an opponent';
export const BATTLE_FAIL_MESSAGE = 'Failed to start battle. Please try again.';
/** Shown briefly when the client-side live-replay disagrees with the on-chain
 *  BattleResolved result (the on-chain result always wins; this is
 *  presentational, not a real error). */
export const MISMATCH_NOTICE_MESSAGE = 'The on-chain referee ruled differently — syncing the true result…';

/** Personas captured at battle start, reused for the settle dialogue read. */
export type BattlePersonas = { attacker: DialoguePetInput; defender: DialoguePetInput };

/** win/loss/levelUp snapshot taken just before calling battle.mutate. */
export type PreBattleStats = { winCount: number; lossCount: number; level: number };
