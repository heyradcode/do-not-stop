import { env } from '@config/env';
import { getDialogue, saveDialogue } from '@repositories/dialogue.repository';
import { getHeadToHead, getRecentForm, recordBattle } from '@repositories/history.repository';
import { getRecentBanter, recordConversation } from '@repositories/conversation.repository';
import { buildPersona, type Persona } from './prompting/persona';
import { buildBanterContext, buildRivalryContext } from './prompting/context';
import { fallbackDialogue } from './generation/fallback';
import { isHuggingFaceConfigured, generateDialogueViaHf, generateTauntsViaHf } from './generation/client';
import {
    hasPregen,
    setPregen,
    matchupKey,
    takePregen,
    type PregenDialogue,
} from './generation/pregen';
import type {
    Chain,
} from '@typings/chain';
import type {
    DialogueResult,
    DialogueSpeaker,
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

    // Fast path: if this matchup was pre-generated at taunt time, pick the
    // variant matching the real winner instead of generating now.
    const prepared = await consumePregen(input);
    if (prepared) return finalizeDialogue(input, prepared.turns, prepared.model);

    const { turns: rawTurns, model } = await generateTurns(input, attacker, defender);
    const turns = ensureResultCoverage(rawTurns, input, attacker, defender);
    return finalizeDialogue(input, turns, model);
}

/**
 * Take the pre-generated pair for this matchup (if any) and return the turns for
 * the actual winner. The pair was prepared at taunt time and keyed by matchup
 * (the tx hash didn't exist yet). Returns null when nothing was prepared or the
 * preparation failed, so the caller falls back to on-demand generation.
 */
async function consumePregen(
    input: GenerateDialogueInput,
): Promise<{ turns: DialogueTurn[]; model: string } | null> {
    const promise = takePregen(matchupKey(input.chain, input.attacker.petId, input.defender.petId));
    if (!promise) return null;
    try {
        const pair = await promise;
        const turns = input.winner === 'attacker' ? pair.attackerWins : pair.defenderWins;
        return { turns, model: pair.model };
    } catch (err) {
        console.error('[dialogue] pre-generated consume failed, generating on demand:', err);
        return null;
    }
}

/**
 * Persist a settled battle's dialogue and return the response. Records the
 * battle to history (for future rivalry context) and appends the result lines
 * to the rolling transcript — both idempotent and best-effort, never blocking
 * the response. Shared by the on-demand and pre-generated paths.
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

/**
 * Pre-generate BOTH result outcomes the moment the pre-fight taunts exist —
 * i.e. at "Start Battle", before the wallet is even confirmed. Keyed by matchup
 * (the tx hash isn't known yet); `getOrGenerateDialogue` picks the variant
 * matching the real winner once the battle settles. Fire-and-forget.
 *
 * Starting here (rather than at the tx hash) gives generation the whole
 * wallet-confirm window, which matters on fast EVM L2s where the hash-to-settle
 * window is too short for two LLM calls to finish.
 *
 * The just-generated taunts are passed in as the banter context so the result
 * reactions continue from the exact lines the player saw — no DB round-trip and
 * no race against the taunt write. No-op without AI configured (on-demand
 * fallback covers it) or if a preparation is already in flight for this matchup.
 *
 * `leveledUp` is unknown pre-settle (it depends on winning), so both variants
 * are generated with `leveledUp: false`; the level-up nuance is minor flavor.
 */
function startResultPregen(
    input: GenerateTauntsInput,
    attacker: Persona,
    defender: Persona,
    taunts: DialogueTurn[],
): void {
    if (!isHuggingFaceConfigured()) return;

    const key = matchupKey(input.chain, input.attacker.petId, input.defender.petId);
    if (hasPregen(key)) return;

    // Seed the result generation with the taunts the player actually saw so the
    // reactions are a coherent continuation of them.
    const banter = buildBanterContext(taunts);

    const variant = async (winner: DialogueSpeaker): Promise<{ turns: DialogueTurn[]; model: string }> => {
        const variantInput: GenerateDialogueInput = {
            chain: input.chain,
            // No tx hash at pregen time; battleId is only used to exclude the
            // current battle from history/banter, which doesn't exist yet.
            battleId: '',
            attacker: input.attacker,
            defender: input.defender,
            winner,
            leveledUp: false,
        };
        const { turns, model } = await generateTurns(variantInput, attacker, defender, { banterOverride: banter });
        return { turns: ensureResultCoverage(turns, variantInput, attacker, defender), model };
    };

    const promise: Promise<PregenDialogue> = (async () => {
        const [attackerWins, defenderWins] = await Promise.all([variant('attacker'), variant('defender')]);
        return { attackerWins: attackerWins.turns, defenderWins: defenderWins.turns, model: attackerWins.model };
    })();

    // Guard against an unhandled rejection if no result ever consumes this.
    promise.catch(() => undefined);
    setPregen(key, promise);
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
export async function generateTaunts(input: GenerateTauntsInput): Promise<TauntsResult> {
    if (!isHuggingFaceConfigured()) {
        throw new Error('HF inference is not configured (HF_API_TOKEN unset)');
    }

    const { chain } = input;
    const { petId: attackerId, name: attackerName } = input.attacker;
    const { petId: defenderId, name: defenderName } = input.defender;

    const attacker = buildPersona(input.attacker);
    const defender = buildPersona(input.defender);

    const [rivalry, banter] = await Promise.all([
        buildRivalry(chain, attackerId, defenderId),
        buildBanter(chain, attackerId, defenderId, undefined, true),
    ]);

    const turns = await generateTauntsViaHf(
        attackerName,
        defenderName,
        attacker,
        defender,
        rivalry,
        banter,
    );

    await recordConversationSafe(
        { chain, attacker: attackerId, defender: defenderId, battleId: null },
        turns,
    );

    // Kick off result pregen now, seeded with these taunts, so the result read
    // after the battle settles is served instantly and stays coherent with the
    // banter the player saw. Fire-and-forget — failures fall back to on-demand.
    startResultPregen(input, attacker, defender, turns);

    return { turns, model: env.hf.model };
}

/**
 * Produce the conversation turns. Uses the Hugging Face model when configured,
 * else (or on any error) deterministic templated lines so the endpoint always
 * returns something usable.
 *
 * `banterOverride` lets the pregen path supply the exact pre-fight taunts as
 * banter context instead of reading the rolling transcript — keeps the result
 * coherent with what the player saw and avoids a race against the taunt write.
 */
async function generateTurns(
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
    tauntsOnly = false,
): Promise<string> {
    try {
        const turns = await getRecentBanter(chain, attackerId, defenderId, 6, excludeBattleId);
        // For pre-fight taunts, drop prior result lines so the model isn't primed
        // to echo an outcome into what must be outcome-free trash talk.
        const relevant = tauntsOnly ? turns.filter((t) => t.phase !== 'result') : turns;
        return buildBanterContext(relevant);
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
