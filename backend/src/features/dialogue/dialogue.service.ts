import { env } from '@config/env';
import { getDialogue, saveDialogue } from '@repositories/dialogue.repository';
import {
    getHeadToHead,
    getRecentForm,
    recordBattle,
} from '@repositories/battle-history.repository';
import {
    getRecentBanter,
    recordConversation,
} from '@repositories/battle-conversation.repository';
import { buildPersona, type Persona } from './dialogue.persona';
import { buildBanterContext, buildRivalryContext, fallbackDialogue } from './dialogue.prompt';
import { generateDialogueViaHf, generateTauntsViaHf } from './dialogue.client';
import type {
    Chain,
} from '@typings/chain';
import type {
    DialogueResult,
    DialogueTurn,
    GenerateDialogueInput,
    GenerateTauntsInput,
    TauntsResult,
} from './dialogue.types';

/**
 * Return a battle's conversation: served from the generate-once store if present,
 * otherwise generated, persisted, and returned. The chain decides the winner; we
 * only narrate toward it (see AI_BATTLE_DIALOGUE.md).
 */
export async function getOrGenerateDialogue(input: GenerateDialogueInput): Promise<DialogueResult> {
    // Build personas before the cache check so we can supplement cached turns too.
    const attacker = buildPersona(input.attacker);
    const defender = buildPersona(input.defender);

    const cached = await getDialogue(input.chain, input.battleId);
    if (cached) {
        // Old cached dialogues may be missing the opponent's result line if the AI
        // attributed every turn to the attacker. Supplement on read without re-saving.
        const turns = ensureResultCoverage(cached.turns, input, attacker, defender);
        return { turns, model: cached.model, cached: true };
    }

    // Persist this settled battle to history so later bouts between these pets
    // get real head-to-head / recent-form context. Idempotent (upsert on
    // chain+battleId) and best-effort — never block dialogue on it.
    await recordBattleHistory(input);

    const { turns: rawTurns, model } = await generateTurns(input, attacker, defender);
    const turns = ensureResultCoverage(rawTurns, input, attacker, defender);

    await saveDialogue({
        chain: input.chain,
        battleId: input.battleId,
        attacker: input.attacker.petId,
        defender: input.defender.petId,
        winner: input.winner,
        turns,
        model,
    });

    // Append the result reactions to the rolling transcript (taunts were already
    // recorded pre-fight). Best-effort — never block the response on it.
    await recordResultLines(input, turns);

    return { turns, model, cached: false };
}

/**
 * Guarantee that both fighters have at least one result-phase turn. If the AI
 * only wrote the winner's reaction (a common failure mode), fill in the missing
 * speaker from the deterministic fallback template so the result screen always
 * shows both sides of the conversation.
 */
function ensureResultCoverage(
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

/**
 * Generate pre-fight taunts (AI only — no templated fallback, by product choice).
 * Throws on failure so the caller surfaces it; persists the taunts to the rolling
 * transcript so future bouts can call back to them.
 */
export async function getOrGenerateTaunts(input: GenerateTauntsInput): Promise<TauntsResult> {
    if (!env.hf.apiToken) {
        throw new Error('HF inference is not configured (HF_API_TOKEN unset)');
    }

    const attacker = buildPersona(input.attacker);
    const defender = buildPersona(input.defender);

    const attackerId = input.attacker.petId;
    const defenderId = input.defender.petId;
    const [rivalry, banter] = await Promise.all([
        buildRivalry(input.chain, attackerId, defenderId),
        buildBanter(input.chain, attackerId, defenderId),
    ]);

    const turns = await generateTauntsViaHf(
        input.attacker.name,
        input.defender.name,
        attacker,
        defender,
        rivalry,
        banter,
    );

    await recordConversationSafe({
        chain: input.chain,
        attacker: attackerId,
        defender: defenderId,
        battleId: null,
    }, turns);

    return { turns, model: env.hf.model };
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
            const attackerId = input.attacker.petId;
            const defenderId = input.defender.petId;
            const [rivalry, banter] = await Promise.all([
                buildRivalry(input.chain, attackerId, defenderId, input.battleId),
                buildBanter(input.chain, attackerId, defenderId, input.battleId),
            ]);
            const turns = await generateDialogueViaHf(input, attacker, defender, rivalry, banter);
            return { turns, model: env.hf.model };
        } catch (err) {
            console.error('[dialogue] HF generation failed, using fallback:', err);
        }
    }
    return { turns: fallbackDialogue(input, attacker, defender), model: 'fallback' };
}

/** Append only the result-phase lines to the transcript (taunts came pre-fight). */
async function recordResultLines(input: GenerateDialogueInput, turns: DialogueTurn[]): Promise<void> {
    const resultTurns = turns.filter((t) => t.phase === 'result');
    await recordConversationSafe(
        {
            chain: input.chain,
            attacker: input.attacker.petId,
            defender: input.defender.petId,
            battleId: input.battleId,
        },
        resultTurns,
    );
}

/** Persist transcript lines, swallowing failures so generation is never blocked. */
async function recordConversationSafe(
    meta: { chain: Chain; attacker: string; defender: string; battleId?: string | null },
    turns: DialogueTurn[],
): Promise<void> {
    try {
        await recordConversation(meta, turns);
    } catch (err) {
        console.error('[dialogue] failed to record conversation:', err);
    }
}

/**
 * Recent banter between the pair, rendered for the prompt. Returns '' on any
 * failure so generation still proceeds.
 */
async function buildBanter(
    chain: Chain,
    attackerId: string,
    defenderId: string,
    excludeBattleId?: string,
): Promise<string> {
    try {
        const turns = await getRecentBanter(chain, attackerId, defenderId, 6, excludeBattleId);
        return buildBanterContext(turns);
    } catch (err) {
        console.error('[dialogue] banter lookup failed, continuing without it:', err);
        return '';
    }
}

/**
 * Record the settled battle into `battle_history`. The winner is mapped from the
 * attacker/defender role to the concrete pet id so head-to-head tallies stay
 * correct when the pets swap roles across battles. Best-effort: a failure here
 * must not stop us from returning the dialogue.
 */
async function recordBattleHistory(input: GenerateDialogueInput): Promise<void> {
    try {
        const winnerPetId =
            input.winner === 'attacker' ? input.attacker.petId : input.defender.petId;
        await recordBattle({
            chain: input.chain,
            battleId: input.battleId,
            attacker: input.attacker.petId,
            defender: input.defender.petId,
            winnerPetId,
            foughtAt: BigInt(Date.now()),
        });
    } catch (err) {
        console.error('[dialogue] failed to record battle history:', err);
    }
}

/**
 * Compact rivalry/recent-form context from prior battles (the current battle is
 * excluded). Returns '' if the history lookup fails so generation still proceeds.
 */
async function buildRivalry(
    chain: Chain,
    attackerId: string,
    defenderId: string,
    excludeBattleId?: string,
): Promise<string> {
    try {
        const [headToHead, attackerForm, defenderForm] = await Promise.all([
            getHeadToHead(chain, attackerId, defenderId, excludeBattleId),
            getRecentForm(chain, attackerId, 5, excludeBattleId),
            getRecentForm(chain, defenderId, 5, excludeBattleId),
        ]);
        return buildRivalryContext(headToHead, attackerForm, defenderForm, attackerId, defenderId);
    } catch (err) {
        console.error('[dialogue] rivalry lookup failed, continuing without it:', err);
        return '';
    }
}
