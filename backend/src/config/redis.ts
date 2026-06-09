import { env } from './env';

/**
 * Optional Redis connection for the process.
 *
 * Redis is only used when `REDIS_URL` is set (e.g. to share the battle-dialogue
 * pregen store across instances / survive restarts). `ioredis` is an OPTIONAL
 * dependency, imported dynamically only when the URL is configured — run
 * `pnpm add ioredis` when you provision Redis. Without the URL (or on import
 * failure) `getRedis()` resolves to `null` and callers fall back to their
 * in-process behaviour.
 */

/** Minimal slice of the ioredis client we use (typed locally so the dep is optional). */
export interface RedisLike {
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ...args: unknown[]): Promise<unknown>;
    del(key: string): Promise<unknown>;
}

/**
 * In dev, `tsx watch` reloads modules on change; caching the client on
 * `globalThis` avoids opening a new connection on every reload.
 */
const globalForRedis = globalThis as unknown as {
    redis?: Promise<RedisLike | null>;
};

async function createClient(): Promise<RedisLike | null> {
    if (!env.redis.url) return null;
    try {
        // Non-literal specifier so tsc doesn't require the optional module at build.
        const pkg: string = 'ioredis';
        const mod = (await import(pkg)) as { default: new (url: string) => RedisLike };
        const Redis = mod.default;
        return new Redis(env.redis.url);
    } catch (err) {
        console.error(
            '[redis] REDIS_URL is set but ioredis is unavailable. ' +
                'Run `pnpm add ioredis` to enable the Redis-backed store.',
            err,
        );
        return null;
    }
}

/**
 * Lazily-built singleton Redis client, or `null` when Redis isn't configured /
 * available. The promise is cached so the connection is opened at most once.
 */
export function getRedis(): Promise<RedisLike | null> {
    if (!globalForRedis.redis) globalForRedis.redis = createClient();
    return globalForRedis.redis;
}
