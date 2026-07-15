import { getRedis } from '@config/redis';
import { PREGEN_TTL_MS, PREGEN_TTL_SEC, type PregenDialogue } from '@typings/pregen';

/**
 * Store for pre-generated battle dialogue.
 *
 * Pregen starts when the pre-fight taunts are generated (on "Start Battle"), long
 * before the battle settles. The winner is unknown then, so we generate BOTH
 * outcomes up front (see pregen.service `startResultPregen`). The tx hash
 * doesn't exist yet either, so we key by the MATCHUP (chain + attacker + defender
 * pet ids) instead of battleId. When the result lands we take the variant
 * matching the real winner.
 *
 * Two backends behind one contract:
 *  - In-memory (default): a Map of deferred promises — a consumer can await a
 *    generation that's still in flight, and a second producer is deduped. Correct
 *    only within a single process.
 *  - Redis (when REDIS_URL is set): survives restarts and works across instances.
 *    It can only hold resolved values, so a still-generating pregen reads as a
 *    miss (the caller then generates on demand) rather than awaiting it.
 *
 * The Redis connection is provided by `@config/redis` (optional `ioredis` dep);
 * when it's unavailable we fall back to the in-memory store.
 */

/**
 * Reserve → fulfill → take lifecycle:
 *  - `reserve` claims the slot: true means the caller should generate; false means
 *    a generation is already in flight or done (dedup).
 *  - `fulfill` publishes the finished pair.
 *  - `take` consumes it once (each battle settles once), or null if absent/expired.
 *  - `release` drops a reservation whose generation failed, so a retry can re-claim.
 */
export interface PregenStore {
    reserve(key: string): Promise<boolean>;
    fulfill(key: string, value: PregenDialogue): Promise<void>;
    take(key: string): Promise<PregenDialogue | null>;
    release(key: string): Promise<void>;
}

interface Deferred {
    promise: Promise<PregenDialogue>;
    resolve: (value: PregenDialogue) => void;
    reject: (err: unknown) => void;
    expiresAt: number;
}

/** Single-process store: holds in-flight promises so consumers can await them. */
class InMemoryPregenStore implements PregenStore {
    private readonly store = new Map<string, Deferred>();

    async reserve(key: string): Promise<boolean> {
        this.purgeExpired();
        if (this.store.has(key)) return false;
        let resolve!: (value: PregenDialogue) => void;
        let reject!: (err: unknown) => void;
        const promise = new Promise<PregenDialogue>((res, rej) => {
            resolve = res;
            reject = rej;
        });
        // Nothing may consume this (battle abandoned) — swallow to avoid a warning.
        promise.catch(() => undefined);
        this.store.set(key, { promise, resolve, reject, expiresAt: Date.now() + PREGEN_TTL_MS });
        return true;
    }

    async fulfill(key: string, value: PregenDialogue): Promise<void> {
        this.store.get(key)?.resolve(value);
    }

    async take(key: string): Promise<PregenDialogue | null> {
        const entry = this.store.get(key);
        if (!entry) return null;
        if (entry.expiresAt <= Date.now()) {
            this.store.delete(key);
            return null;
        }
        try {
            // Keep the entry in the map while awaiting so a still-running fulfill()
            // (which looks up by key) can resolve it; remove it once consumed.
            return await entry.promise;
        } catch {
            return null;
        } finally {
            this.store.delete(key);
        }
    }

    async release(key: string): Promise<void> {
        const entry = this.store.get(key);
        if (!entry) return;
        this.store.delete(key);
        entry.reject(new Error('pregen released'));
    }

    /** Lazy eviction: drop expired entries on each reserve so the map self-cleans. */
    private purgeExpired(): void {
        const now = Date.now();
        for (const [key, entry] of this.store) {
            if (entry.expiresAt <= now) this.store.delete(key);
        }
    }
}

const PENDING = '__pending__';

/** Cross-instance store: resolved values only, with a NX lock for dedup. */
class RedisPregenStore implements PregenStore {
    constructor(private readonly client: RedisClient) {}

    async reserve(key: string): Promise<boolean> {
        // SET key PENDING EX ttl NX → 'OK' only if we acquired the (absent) slot.
        const res = await this.client.set(key, PENDING, 'EX', PREGEN_TTL_SEC, 'NX');
        return res === 'OK';
    }

    async fulfill(key: string, value: PregenDialogue): Promise<void> {
        await this.client.set(key, JSON.stringify(value), 'EX', PREGEN_TTL_SEC);
    }

    async take(key: string): Promise<PregenDialogue | null> {
        const raw = await this.client.get(key);
        if (!raw || raw === PENDING) return null; // absent, or still generating elsewhere
        await this.client.del(key);
        try {
            return JSON.parse(raw) as PregenDialogue;
        } catch {
            return null;
        }
    }

    async release(key: string): Promise<void> {
        await this.client.del(key);
    }
}

type RedisClient = NonNullable<Awaited<ReturnType<typeof getRedis>>>;

let storePromise: Promise<PregenStore> | null = null;

async function createStore(): Promise<PregenStore> {
    const client = await getRedis();
    return client ? new RedisPregenStore(client) : new InMemoryPregenStore();
}

/** Lazily-built singleton store, chosen by config (Redis when REDIS_URL is set). */
export function getPregenStore(): Promise<PregenStore> {
    if (!storePromise) storePromise = createStore();
    return storePromise;
}
