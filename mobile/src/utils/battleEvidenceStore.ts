import AsyncStorage from '@react-native-async-storage/async-storage';
import type { EvidenceStore } from '@shared/core';

/**
 * Persistent battle-evidence storage for React Native.
 *
 * `shared`'s `battleEvidence` module wants the synchronous Web Storage shape and
 * falls back to a no-op store when it cannot find one. React Native has no
 * `localStorage`, so mobile was silently taking that fallback: the signed
 * commitment proving the drand round was chosen before the randomness existed
 * (§E, §J) was handed over once and then dropped. The whole point of holding a
 * copy is that the player's evidence does not depend on the backend continuing to
 * serve it, so a no-op there is not the convenience loss it is on a private-mode
 * browser — it is the evidence never existing.
 *
 * AsyncStorage cannot satisfy a synchronous interface directly, so an in-memory
 * map is the synchronous surface and AsyncStorage is the durable one behind it:
 * reads come from memory, writes go to both. A write that never reaches disk
 * because the app was killed in the same instant is the one loss this shape
 * accepts, and it is strictly better than never writing at all.
 */

/** Matches `KEY_PREFIX` in `shared/src/utils/battleEvidence.ts`, index key included. */
const KEY_PREFIX = 'cryptopets.battle-evidence.';

const cache = new Map<string, string>();
let hydrating: Promise<void> | null = null;

export const battleEvidenceStore: EvidenceStore = {
    getItem: (key) => cache.get(key) ?? null,
    setItem: (key, value) => {
        cache.set(key, value);
        AsyncStorage.setItem(key, value).catch(() => undefined);
    },
    removeItem: (key) => {
        cache.delete(key);
        AsyncStorage.removeItem(key).catch(() => undefined);
    },
};

/**
 * Loads previously stored evidence into the synchronous cache.
 *
 * Reads never wait on this: an un-hydrated cache reports "no evidence", which is
 * what an empty store would say anyway. It only decides whether evidence from an
 * earlier launch is visible in this one.
 *
 * A key already in the cache is left alone. Evidence saved between launch and
 * hydration is newer than anything on disk, and overwriting it here would lose
 * exactly the commitment the player just received.
 */
export function hydrateBattleEvidence(): Promise<void> {
    if (hydrating) return hydrating;
    hydrating = (async () => {
        const keys = await AsyncStorage.getAllKeys();
        const ours = keys.filter((k) => k.startsWith(KEY_PREFIX));
        if (ours.length === 0) return;
        for (const [key, value] of await AsyncStorage.multiGet(ours)) {
            if (value !== null && !cache.has(key)) {
                cache.set(key, value);
            }
        }
    })().catch(() => undefined);
    return hydrating;
}

/** Test seam: drops the cache and lets hydration run again. */
export function resetBattleEvidenceCache(): void {
    cache.clear();
    hydrating = null;
}
