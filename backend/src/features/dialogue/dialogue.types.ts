import type { z } from 'zod';
import type { Chain } from '@typings/chain';
import type { TurnSchema } from './dialogue.schema';

/** One line of the battle conversation. Shape is derived from TurnSchema. */
export type DialogueTurn = z.infer<typeof TurnSchema>;
export type DialogueSpeaker = DialogueTurn['speaker'];
export type DialoguePhase = DialogueTurn['phase'];

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

/** Inputs to generate pre-fight taunts. No winner — the outcome is unknown yet. */
export interface GenerateTauntsInput {
    chain: Chain;
    attacker: PetPersonaInput;
    defender: PetPersonaInput;
}

/**
 * Inputs to pre-generate a settled battle's dialogue while it confirms
 * on-chain. No winner — both outcomes are generated and the right one is picked
 * once the result is known.
 */
export interface PrepareDialogueInput {
    chain: Chain;
    battleId: string;
    attacker: PetPersonaInput;
    defender: PetPersonaInput;
}

/** Generated pre-fight taunts plus provenance. */
export interface TauntsResult {
    turns: DialogueTurn[];
    model: string;
}

/** Generated (or cached) conversation plus provenance. */
export interface DialogueResult {
    turns: DialogueTurn[];
    /** Which Claude model produced it, or `fallback` when AI was unavailable. */
    model: string;
    /** True when served from the generate-once store rather than freshly generated. */
    cached: boolean;
}
