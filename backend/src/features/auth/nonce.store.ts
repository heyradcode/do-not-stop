/**
 * Single-use nonce store for wallet auth challenges.
 *
 * `GET /nonce` issues a nonce; `POST /verify` consumes it. A nonce is only
 * accepted once and only within its TTL, so a captured signature cannot be
 * replayed — the message it signs embeds a nonce that no longer exists.
 *
 * In-memory (same trade-off as the demo user store): correct for a single
 * process; move to Redis alongside the user table for multi-instance.
 */

const NONCE_TTL_MS = 5 * 60 * 1000;

const issued = new Map<string, number>(); // nonce → expiry epoch ms

/** Record a freshly issued nonce so `consumeNonce` can accept it later. */
export function storeNonce(nonce: string): void {
    purgeExpired();
    issued.set(nonce, Date.now() + NONCE_TTL_MS);
}

/**
 * Single-use take: true only if the nonce was issued by us and is still fresh.
 * The nonce is deleted on the attempt (success or not), so it can never be
 * presented twice.
 */
export function consumeNonce(nonce: string): boolean {
    const expiresAt = issued.get(nonce);
    if (expiresAt === undefined) return false;
    issued.delete(nonce);
    return expiresAt > Date.now();
}

/** Lazy eviction on each issue so abandoned nonces don't accumulate. */
function purgeExpired(): void {
    const now = Date.now();
    for (const [nonce, expiresAt] of issued) {
        if (expiresAt <= now) issued.delete(nonce);
    }
}
