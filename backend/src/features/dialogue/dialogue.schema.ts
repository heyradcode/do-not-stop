import { z } from 'zod';

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
