import { env } from '@config/env';
import { buildPersona, type Persona } from '../llm/persona';
import { isHuggingFaceConfigured, requestTaunts, streamTaunts } from '../llm/client';
import { buildBanter, buildRivalry } from '../shared/context';
import { recordConversationSafe } from '../shared/recording';
import { startResultPregen } from '../result/pregen.service';
import type { DialogueTurn, GenerateTauntsInput, TauntsResult } from '../dialogue.types';

/**
 * Generate pre-fight taunts (AI only — no templated fallback, by product choice).
 * Throws on failure so the caller surfaces it; persists the taunts to the rolling
 * transcript so future bouts can call back to them.
 */
export async function generateTaunts(input: GenerateTauntsInput): Promise<TauntsResult> {
    if (!isHuggingFaceConfigured()) {
        throw new Error('HF inference is not configured (HF_API_TOKEN unset)');
    }

    const ctx = await prepareTauntContext(input);
    const turns = await requestTaunts(
        ctx.attackerName,
        ctx.defenderName,
        ctx.attacker,
        ctx.defender,
        ctx.rivalry,
        ctx.banter,
    );

    await persistTaunts(input, ctx, turns);
    return { turns, model: env.hf.model };
}

/**
 * Streaming variant of {@link generateTaunts}: yields the cumulative taunt list
 * as each line finalizes (so the client can reveal them progressively), then runs
 * the same side effects as the non-streaming path once the full set is in —
 * persist the transcript and kick off result pregen.
 */
export async function* streamTauntsConversation(
    input: GenerateTauntsInput,
): AsyncGenerator<DialogueTurn[], void> {
    if (!isHuggingFaceConfigured()) {
        throw new Error('HF inference is not configured (HF_API_TOKEN unset)');
    }

    const ctx = await prepareTauntContext(input);
    const stream = streamTaunts(
        ctx.attackerName,
        ctx.defenderName,
        ctx.attacker,
        ctx.defender,
        ctx.rivalry,
        ctx.banter,
    );

    let turns: DialogueTurn[] = [];
    let step = await stream.next();
    while (!step.done) {
        turns = step.value;
        yield turns;
        step = await stream.next();
    }
    turns = step.value; // the complete, validated list
    yield turns;

    await persistTaunts(input, ctx, turns);
}

interface TauntContext {
    attacker: Persona;
    defender: Persona;
    attackerName: string;
    defenderName: string;
    rivalry: string;
    banter: string;
}

/** Shared pre-fight prep: personas plus rivalry/banter context for both fighters. */
async function prepareTauntContext(input: GenerateTauntsInput): Promise<TauntContext> {
    const { chain } = input;
    const attackerId = input.attacker.petId;
    const defenderId = input.defender.petId;
    const [rivalry, banter] = await Promise.all([
        buildRivalry(chain, attackerId, defenderId),
        buildBanter(chain, attackerId, defenderId, undefined, true),
    ]);
    return {
        attacker: buildPersona(input.attacker),
        defender: buildPersona(input.defender),
        attackerName: input.attacker.name,
        defenderName: input.defender.name,
        rivalry,
        banter,
    };
}

/**
 * Shared taunt side effects: append to the rolling transcript and kick off result
 * pregen seeded with the taunts the player saw. Best-effort / fire-and-forget so
 * they never block the response.
 */
async function persistTaunts(
    input: GenerateTauntsInput,
    ctx: TauntContext,
    turns: DialogueTurn[],
): Promise<void> {
    await recordConversationSafe(
        {
            chain: input.chain,
            attacker: input.attacker.petId,
            defender: input.defender.petId,
            battleId: null,
        },
        turns,
    );
    startResultPregen(input, ctx.attacker, ctx.defender, turns);
}
