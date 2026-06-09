import { env } from '@config/env';
import type { Persona } from '../llm/persona';
import { buildBanter, buildRivalry } from '../shared/context';
import { fallbackDialogue } from '../llm/fallback';
import { isHuggingFaceConfigured, requestDialogue } from '../llm/client';
import type { DialogueTurn, GenerateDialogueInput } from '../dialogue.types';

/**
 * Produce the settled-battle conversation turns. Uses the Hugging Face model when
 * configured, else (or on any error) deterministic templated lines so the caller
 * always gets something usable.
 *
 * `banterOverride` lets the pregen path supply the exact pre-fight taunts as
 * banter context instead of reading the rolling transcript — keeps the result
 * coherent with what the player saw and avoids a race against the taunt write.
 */
export async function generateTurns(
    input: GenerateDialogueInput,
    attacker: Persona,
    defender: Persona,
    opts?: { banterOverride?: string },
): Promise<{ turns: DialogueTurn[]; model: string }> {
    if (isHuggingFaceConfigured()) {
        try {
            const attackerId = input.attacker.petId;
            const defenderId = input.defender.petId;
            const excludeBattleId = input.battleId || undefined;
            const [rivalry, banter] = await Promise.all([
                buildRivalry(input.chain, attackerId, defenderId, excludeBattleId),
                opts?.banterOverride !== undefined
                    ? Promise.resolve(opts.banterOverride)
                    : buildBanter(input.chain, attackerId, defenderId, excludeBattleId),
            ]);
            const turns = await requestDialogue(input, attacker, defender, rivalry, banter);
            return { turns, model: env.hf.model };
        } catch (err) {
            console.error('[dialogue] HF generation failed, using fallback:', err);
        }
    }
    return { turns: fallbackDialogue(input, attacker, defender), model: 'fallback' };
}

/**
 * Guarantee that both fighters have at least one result-phase turn. If the AI
 * only wrote the winner's reaction (a common failure mode), fill in the missing
 * speaker from the deterministic fallback template so the result screen always
 * shows both sides of the conversation.
 */
export function ensureResultCoverage(
    turns: DialogueTurn[],
    input: GenerateDialogueInput,
    attacker: Persona,
    defender: Persona,
): DialogueTurn[] {
    const hasAttackerResult = turns.some((t) => t.phase === 'result' && t.speaker === 'attacker');
    const hasDefenderResult = turns.some((t) => t.phase === 'result' && t.speaker === 'defender');
    if (hasAttackerResult && hasDefenderResult) return turns;

    const supplement = fallbackDialogue(input, attacker, defender)
        .filter((t) => t.phase === 'result')
        .filter((t) => (t.speaker === 'attacker' ? !hasAttackerResult : !hasDefenderResult));

    return [...turns, ...supplement];
}
