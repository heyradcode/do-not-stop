import type { Chain } from '@typings/chain';
import type { DialogueTurn } from '../dialogue.types';

/**
 * Ephemeral store for pre-generated battle dialogue.
 *
 * Pregen starts when the pre-fight taunts are generated (on "Start Battle"),
 * long before the battle settles. The winner is unknown then, so we generate
 * BOTH outcomes up front (see dialogue.service `startResultPregen`) and stash
 * the in-flight promise here. The tx hash doesn't exist yet at that point, so we
 * key by the MATCHUP (chain + attacker + defender pet ids) instead of battleId.
 * When the result lands we pick the variant matching the real winner — instantly
 * if generation finished during the confirm window, otherwise by awaiting.
 *
 * A user can only have one battle in flight for a given fighter, so the matchup
 * key is effectively unique in practice (the attacker pet id is the user's, and
 * it can't be in two simultaneous battles).
 *
 * Single-instance only: a plain Map. The get/set/take/key surface is the whole
 * contract, so this can be swapped for Redis when the backend scales out — the
 * Redis impl would store resolved values (not promises) behind the same calls.
 */

/** Both possible outcomes for one matchup, plus the model that produced them. */
export interface PregenDialogue {
    attackerWins: DialogueTurn[];
    defenderWins: DialogueTurn[];
    model: string;
}

interface Entry {
    promise: Promise<PregenDialogue>;
    expiresAt: number;
}

/**
 * How long a prepared pair lives before eviction. Generation now starts at
 * taunt time (pre-wallet), so the window until the battle settles is longer than
 * the old hash-to-settle window — give it 5 minutes to cover slow VRF settles.
 */
const TTL_MS = 300_000;

const store = new Map<string, Entry>();

/** Key a prepared pair by the matchup — the tx hash isn't known at pregen time. */
export function matchupKey(chain: Chain, attacker: string, defender: string): string {
    return `${chain}:${attacker}:${defender}`;
}

/** True if a (non-expired) preparation is already in flight for this key. */
export function hasPregen(key: string): boolean {
    const entry = store.get(key);
    if (!entry) return false;
    if (entry.expiresAt <= Date.now()) {
        store.delete(key);
        return false;
    }
    return true;
}

export function setPregen(key: string, promise: Promise<PregenDialogue>): void {
    purgeExpired();
    store.set(key, { promise, expiresAt: Date.now() + TTL_MS });
}

/**
 * Consume the prepared pair for a key, removing it from the store (each battle
 * settles once). Returns undefined if nothing was prepared or it has expired.
 */
export function takePregen(key: string): Promise<PregenDialogue> | undefined {
    const entry = store.get(key);
    if (!entry) return undefined;
    store.delete(key);
    if (entry.expiresAt <= Date.now()) return undefined;
    return entry.promise;
}

/** Lazy eviction: drop expired entries on each write so the map self-cleans. */
function purgeExpired(): void {
    const now = Date.now();
    for (const [key, entry] of store) {
        if (entry.expiresAt <= now) store.delete(key);
    }
}
