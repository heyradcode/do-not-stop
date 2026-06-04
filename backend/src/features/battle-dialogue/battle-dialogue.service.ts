import { env } from '@config/env';
import { getDialogue, saveDialogue } from '@repositories/dialogue.repository';
import { getHeadToHead, getRecentForm } from '@repositories/battle-history.repository';
import { buildPersona, type Persona } from './battle-dialogue.persona';
import { buildRivalryContext, fallbackDialogue } from './battle-dialogue.prompt';
import { generateDialogueViaHf } from './battle-dialogue.client';
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
 * Produce the conversation turns. Uses the Hugging Face model when configured,
 * else (or on any error) deterministic templated lines so the endpoint always
 * returns something usable.
 */
async function generateTurns(
    input: GenerateDialogueInput,
    attacker: Persona,
    defender: Persona,
): Promise<{ turns: DialogueTurn[]; model: string }> {
    if (env.hf.apiToken) {
        try {
            const rivalry = await buildRivalry(input);
            const turns = await generateDialogueViaHf(input, attacker, defender, rivalry);
            return { turns, model: env.hf.model };
        } catch (err) {
            console.error('[battle-dialogue] HF generation failed, using fallback:', err);
        }
    }
    return { turns: fallbackDialogue(input, attacker, defender), model: 'fallback' };
}

/**
 * Compact rivalry/recent-form context from prior battles (the current battle is
 * excluded). Returns '' if the history lookup fails so generation still proceeds.
 */
async function buildRivalry(input: GenerateDialogueInput): Promise<string> {
    try {
        const { chain, battleId } = input;
        const attackerId = input.attacker.petId;
        const defenderId = input.defender.petId;
        const [headToHead, attackerForm, defenderForm] = await Promise.all([
            getHeadToHead(chain, attackerId, defenderId, battleId),
            getRecentForm(chain, attackerId, 5, battleId),
            getRecentForm(chain, defenderId, 5, battleId),
        ]);
        return buildRivalryContext(headToHead, attackerForm, defenderForm, attackerId, defenderId);
    } catch (err) {
        console.error('[battle-dialogue] rivalry lookup failed, continuing without it:', err);
        return '';
    }
}
