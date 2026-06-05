import type { Chain } from '@typings/chain';
import type { DialogueTurn } from './dialogue.types';

/**
 * Ephemeral store for pre-generated battle dialogue.
 *
 * While a battle is confirming on-chain the winner is unknown, so we generate
 * BOTH outcomes up front (see dialogue.service `prepareDialogue`) and stash the
 * in-flight promise here, keyed by chain+battleId. When the result lands we pick
 * the variant matching the real winner — instantly if generation already
 * finished during the confirmation window, otherwise by awaiting the promise.
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

/** How long a prepared pair lives before eviction. Covers slow VRF settles. */
const TTL_MS = 120_000;

const store = new Map<string, Entry>();

export function pregenKey(chain: Chain, battleId: string): string {
    return `${chain}:${battleId}`;
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
