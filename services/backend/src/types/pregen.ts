import type { Chain } from './chain';
// Direct path, not the `@features/dialogue` barrel: that barrel pulls in
// dialogue.controller.ts, which depends on the pregen repository — a type-only
// import is erased at compile time either way, but this avoids even the
// appearance of a dependency loop for anyone tracing imports by hand.
import type { DialogueTurn } from '../features/dialogue/dialogue.types';

/**
 * Domain types for the battle-dialogue pregen store. Kept neutral (not inside
 * `@features/dialogue`) because both the dialogue feature (producer) and
 * `@repositories/pregen.repository` (the store implementation) need these at
 * runtime — the feature's own barrel (`@features/dialogue/index.ts`) pulls in
 * `dialogue.controller.ts`, which itself depends on the pregen repository, so
 * the repository importing a value (not just a type) back through that barrel
 * would be a circular import.
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
