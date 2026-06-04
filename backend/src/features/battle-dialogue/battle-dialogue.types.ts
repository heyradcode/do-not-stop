import type { Chain } from '@typings/chain';

/** Which fighter is speaking. The attacker is the caller's pet; defender is the opponent. */
export type DialogueSpeaker = 'attacker' | 'defender';

/** `taunt` lines run before the fight; `result` lines react to the settled outcome. */
export type DialoguePhase = 'taunt' | 'result';

/** One line of the battle conversation. */
export interface DialogueTurn {
    speaker: DialogueSpeaker;
    phase: DialoguePhase;
    text: string;
}

/** Minimal pet attributes used to build a persona (subset of the roster row). */
export interface PetPersonaInput {
    petId: string;
    name: string;
    level: number;
    rarity: number;
    dna: string;
    winCount: number;
    lossCount: number;
}

/** Everything needed to generate (or look up) a battle's dialogue. */
export interface GenerateDialogueInput {
    chain: Chain;
    /** Stable per-battle key — EVM: tx hash + log index; Solana: settle signature. */
    battleId: string;
    attacker: PetPersonaInput;
    defender: PetPersonaInput;
    /** Authoritative on-chain result; the narrative is written toward it. */
    winner: DialogueSpeaker;
    /** Whether the winner leveled up from this battle (flavor for the result line). */
    leveledUp?: boolean;
}

/** Generated (or cached) conversation plus provenance. */
export interface DialogueResult {
    turns: DialogueTurn[];
    /** Which Claude model produced it, or `fallback` when AI was unavailable. */
    model: string;
    /** True when served from the generate-once store rather than freshly generated. */
    cached: boolean;
}
