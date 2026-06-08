import { z } from 'zod';
import { SUPPORTED_CHAINS } from '@typings/chain';

export const MAX_TURNS = 8;
export const MAX_TURN_CHARS = 140;
/** Pre-fight taunts are capped to a tight back-and-forth: 2 lines per fighter. */
export const TAUNT_TURNS = 4;

const DEFENDER_ALIASES = ['defender', 'fighter_b', 'b', 'opponent'] as const;

export const TurnSchema = z.object({
    speaker: z
        .string()
        .transform((v) =>
            DEFENDER_ALIASES.includes(v.toLowerCase().trim() as (typeof DEFENDER_ALIASES)[number])
                ? 'defender'
                : 'attacker',
        ),
    phase: z.string().transform((v) => (v === 'result' ? 'result' : 'taunt')),
    text: z.string().min(1).transform((v) => v.trim().slice(0, MAX_TURN_CHARS)),
});

export const ResponseSchema = z.object({
    // No upper bound here on purpose: models sometimes over-produce turns. We
    // accept them and clamp to MAX_TURNS in the client rather than rejecting the
    // whole (otherwise valid) reply — the taunt path has no fallback, so a hard
    // max would surface every over-production as a 502.
    turns: z.array(TurnSchema).min(1),
});

const ChainSchema = z.enum(SUPPORTED_CHAINS);
const SpeakerSchema = z.enum(['attacker', 'defender']);

/** Minimal pet attributes a request must carry to build a persona. */
export const PetPersonaSchema = z.object({
    petId: z.string(),
    name: z.string(),
    level: z.number(),
    rarity: z.number(),
    dna: z.string(),
    winCount: z.number(),
    lossCount: z.number(),
});

/** Body of POST /api/battle-dialogue/result (a settled battle). */
export const DialogueRequestSchema = z.object({
    chain: ChainSchema,
    battleId: z.string().min(1),
    attacker: PetPersonaSchema,
    defender: PetPersonaSchema,
    winner: SpeakerSchema,
    // Lenient like the rest of the body: a non-boolean is dropped, not rejected.
    leveledUp: z.boolean().optional().catch(undefined),
});

/** Body of POST /api/battle-dialogue/taunts (no winner — fight hasn't happened). */
export const TauntsRequestSchema = z.object({
    chain: ChainSchema,
    attacker: PetPersonaSchema,
    defender: PetPersonaSchema,
});
