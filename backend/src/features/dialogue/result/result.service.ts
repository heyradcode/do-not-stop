import { getDialogue, saveDialogue } from '@repositories/dialogue.repository';
import { buildPersona } from '../llm/persona';
import { generateTurns, ensureResultCoverage } from './turns';
import { getPregenStore } from '@repositories/pregen.repository';
import { matchupKey } from './pregen.types';
import { recordBattleHistory, recordResultLines } from '../recording';
import type { DialogueResult, DialogueTurn, GenerateDialogueInput } from '../dialogue.types';

/**
 * Return a battle's conversation: served from the generate-once store if present,
 * otherwise from the pre-generated pair, otherwise generated now — then persisted.
 * The chain decides the winner; we only narrate toward it (see AI_BATTLE_DIALOGUE.md).
 */
export async function getOrGenerateDialogue(input: GenerateDialogueInput): Promise<DialogueResult> {
    // Build personas before the cache check so we can supplement cached turns too.
    const attacker = buildPersona(input.attacker);
    const defender = buildPersona(input.defender);

    // Fast path: if this matchup was pre-generated at taunt time, pick the
    // variant matching the real winner instead of generating now.
    const prepared = await consumePregen(input);
    if (prepared) return finalizeDialogue(input, prepared.turns, prepared.model);

    const cached = await getDialogue(input.chain, input.battleId);
    if (cached) {
        // Old cached dialogues may be missing the opponent's result line if the AI
        // attributed every turn to the attacker. Supplement on read without re-saving.
        const turns = ensureResultCoverage(cached.turns, input, attacker, defender);
        return { turns, model: cached.model, cached: true };
    }

    const { turns: rawTurns, model } = await generateTurns(input, attacker, defender);
    const turns = ensureResultCoverage(rawTurns, input, attacker, defender);
    return finalizeDialogue(input, turns, model);
}

/**
 * Take the pre-generated pair for this matchup (if any) and return the turns for
 * the actual winner. The pair was prepared at taunt time and keyed by matchup
 * (the tx hash didn't exist yet). Returns null when nothing was prepared, so the
 * caller falls back to on-demand generation.
 */
async function consumePregen(
    input: GenerateDialogueInput,
): Promise<{ turns: DialogueTurn[]; model: string } | null> {
    const store = await getPregenStore();
    const pair = await store.take(matchupKey(input.chain, input.attacker.petId, input.defender.petId));
    if (!pair) return null;
    const turns = input.winner === 'attacker' ? pair.attackerWins : pair.defenderWins;
    return { turns, model: pair.model };
}

/**
 * Persist a settled battle's dialogue and return the response. Records the battle
 * to history (for future rivalry context) and appends the result lines to the
 * rolling transcript — both idempotent and best-effort, never blocking the
 * response. Shared by the on-demand and pre-generated paths.
 */
async function finalizeDialogue(
    input: GenerateDialogueInput,
    turns: DialogueTurn[],
    model: string,
): Promise<DialogueResult> {
    await recordBattleHistory(input);

    await saveDialogue({
        chain: input.chain,
        battleId: input.battleId,
        attacker: input.attacker.petId,
        defender: input.defender.petId,
        winner: input.winner,
        turns,
        model,
    });

    await recordResultLines(input, turns);

    return { turns, model, cached: false };
}
