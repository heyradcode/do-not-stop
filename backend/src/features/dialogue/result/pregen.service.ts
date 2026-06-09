import type { Persona } from '../llm/persona';
import { buildBanterContext } from '../llm/render';
import { isHuggingFaceConfigured } from '../llm/client';
import { generateTurns, ensureResultCoverage } from './turns';
import { getPregenStore, matchupKey } from './pregen.store';
import type {
    DialogueSpeaker,
    DialogueTurn,
    GenerateDialogueInput,
    GenerateTauntsInput,
} from '../dialogue.types';

/**
 * Pre-generate BOTH result outcomes the moment the pre-fight taunts exist —
 * i.e. at "Start Battle", before the wallet is even confirmed. Keyed by matchup
 * (the tx hash isn't known yet); the result use-case picks the variant matching
 * the real winner once the battle settles. Fire-and-forget.
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
export function startResultPregen(
    input: GenerateTauntsInput,
    attacker: Persona,
    defender: Persona,
    taunts: DialogueTurn[],
): void {
    const key = matchupKey(input.chain, input.attacker.petId, input.defender.petId);

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

    // Fire-and-forget: claim the matchup slot, generate both outcomes, publish.
    void (async () => {
        const store = await getPregenStore();
        if (!(await store.reserve(key))) return; // a preparation is already in flight/done
        try {
            const [attackerWins, defenderWins] = await Promise.all([variant('attacker'), variant('defender')]);
            await store.fulfill(key, {
                attackerWins: attackerWins.turns,
                defenderWins: defenderWins.turns,
                model: attackerWins.model,
            });
        } catch (err) {
            console.error('[dialogue] result pregen failed:', err);
            await store.release(key);
        }
    })();
}
