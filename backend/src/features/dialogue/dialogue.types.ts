import type { z } from 'zod';
import type {
    ResultRequestSchema,
    PetPersonaSchema,
    TauntsRequestSchema,
    TurnSchema,
} from './dialogue.schema';

/** One line of the battle conversation. Shape is derived from TurnSchema. */
export type DialogueTurn = z.infer<typeof TurnSchema>;
export type DialogueSpeaker = DialogueTurn['speaker'];
export type DialoguePhase = DialogueTurn['phase'];

/** Minimal pet attributes used to build a persona (subset of the roster row). */
export type PetPersonaInput = z.infer<typeof PetPersonaSchema>;

/**
 * Everything needed to generate (or look up) a battle's dialogue. `battleId` is
 * the stable per-battle key (EVM: tx hash + log index; Solana: settle signature);
 * `winner` is the authoritative on-chain result the narrative is written toward.
 */
export type GenerateDialogueInput = z.infer<typeof ResultRequestSchema>;

/**
 * Inputs to generate pre-fight taunts. No winner — the outcome is unknown yet.
 * Generating taunts also kicks off result pregen for both outcomes (keyed by
 * this matchup), so no separate prepare call is needed.
 */
export type GenerateTauntsInput = z.infer<typeof TauntsRequestSchema>;

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
