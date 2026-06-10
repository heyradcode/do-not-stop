import type { Chain } from '@typings/chain';
import type { DialogueTurn } from '../dialogue.types';

/**
 * Domain types for the battle-dialogue pregen store. The store itself (the
 * in-memory + Redis backends) lives in the repositories layer
 * (`@repositories/pregen.repository`); these are the shapes and policy it
 * operates on, kept beside the feature that owns them.
 */

/** Both possible outcomes for one matchup, plus the model that produced them. */
export interface PregenDialogue {
    attackerWins: DialogueTurn[];
    defenderWins: DialogueTurn[];
    model: string;
}

/**
 * How long a prepared pair lives before eviction. Generation starts at taunt time
 * (pre-wallet), so give it 5 minutes to cover slow VRF settles.
 */
export const PREGEN_TTL_MS = 300_000;
export const PREGEN_TTL_SEC = PREGEN_TTL_MS / 1000;

/** Key a prepared pair by the matchup — the tx hash isn't known at pregen time. */
export function matchupKey(chain: Chain, attacker: string, defender: string): string {
    return `${chain}:${attacker}:${defender}`;
}
