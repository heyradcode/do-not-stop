import { buildPersona, type Persona } from '../llm/persona';
import { isHuggingFaceConfigured, streamTaunts } from '../llm/client';
import { buildBanter, buildRivalry } from '../context';
import { recordConversationSafe } from '../recording';
import { startResultPregen } from '../result/pregen.service';
import type { DialogueTurn, GenerateTauntsInput } from '../dialogue.types';

/**
 * Generate pre-fight taunts (AI only — no templated fallback, by product choice).
 * Yields the cumulative taunt list as each line finalizes (so the client can
 * reveal them progressively), then runs the side effects once the full set is in —
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
    let lastYieldedLen = 0;
    let step = await stream.next();

    for (; !step.done; step = await stream.next()) {
        turns = step.value;
        lastYieldedLen = turns.length;
        yield turns;
    }
    // The return value is the complete, validated list. While streaming, the
    // in-progress final turn is held back, so this is normally one turn longer
    // than the last snapshot — emit it. But if the model over-produced turns the
    // last snapshot can already be the full set; skip the redundant trailing line.
    turns = step.value;
    if (turns.length !== lastYieldedLen) {
        yield turns;
    }

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
