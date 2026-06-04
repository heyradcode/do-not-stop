import { env } from '@config/env';
import { getDialogue, saveDialogue } from '@repositories/dialogue.repository';
import { buildPersona, type Persona } from './battle-dialogue.persona';
import { fallbackDialogue } from './battle-dialogue.prompt';
import type { DialogueResult, DialogueTurn, GenerateDialogueInput } from './battle-dialogue.types';

/**
 * Return a battle's conversation: served from the generate-once store if present,
 * otherwise generated, persisted, and returned. The chain decides the winner; we
 * only narrate toward it (see AI_BATTLE_DIALOGUE.md).
 */
export async function getOrGenerateDialogue(input: GenerateDialogueInput): Promise<DialogueResult> {
    const cached = await getDialogue(input.chain, input.battleId);
    if (cached) {
        return { turns: cached.turns, model: cached.model, cached: true };
    }

    const attacker = buildPersona(input.attacker);
    const defender = buildPersona(input.defender);

    const { turns, model } = await generateTurns(input, attacker, defender);

    await saveDialogue({
        chain: input.chain,
        battleId: input.battleId,
        attacker: input.attacker.petId,
        defender: input.defender.petId,
        winner: input.winner,
        turns,
        model,
    });

    return { turns, model, cached: false };
}

/**
 * Produce the conversation turns. Uses Claude when configured, else deterministic
 * templated lines. The AI call is wired in the final step; until then (or when no
 * API key is set) this returns the fallback so the endpoint already works.
 */
async function generateTurns(
    input: GenerateDialogueInput,
    attacker: Persona,
    defender: Persona,
): Promise<{ turns: DialogueTurn[]; model: string }> {
    if (!env.anthropic.apiKey) {
        return { turns: fallbackDialogue(input, attacker, defender), model: 'fallback' };
    }

    // TODO(step 6): call the Anthropic client here (prompt caching + forced tool),
    // and fall back on any error. Until that lands, degrade to templated lines.
    return { turns: fallbackDialogue(input, attacker, defender), model: 'fallback' };
}
