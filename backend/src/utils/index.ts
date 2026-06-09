export function isEvmAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/i.test(address);
}

/** Generate a random URL-safe token (e.g. an auth nonce). */
export function createNonce(): string {
    return (
        Math.random().toString(36).substring(2, 15) +
        Math.random().toString(36).substring(2, 15)
    );
}

/** Strip a user-supplied string to safe, bounded text; falls back when empty. */
export function sanitizeName(name: string, maxLen = 32, fallback = 'Unnamed'): string {
    return (
        name
            .replace(/[<>"'\r\n\x00-\x1f]/g, ' ')
            .trim()
            .slice(0, maxLen) || fallback
    );
}

/** Map a bigint into [0, mod) with a non-negative result. */
export function positiveMod(value: bigint, mod: number): number {
    const m = BigInt(mod);
    return Number(((value % m) + m) % m);
}

export function parseIntParam(
    value: unknown,
    fallback: number,
    min: number,
    max: number
): number {
    const n = Number.parseInt(String(value ?? ''), 10);
    if (Number.isNaN(n)) return fallback;
    return Math.min(Math.max(n, min), max);
}

/**
 * Run a best-effort side effect: on failure, log under `label` and return
 * `fallback` instead of throwing. For non-critical paths that must never block or
 * fail the main response.
 */
export async function bestEffort<T>(
    label: string,
    fn: () => Promise<T>,
    fallback: T
): Promise<T> {
    try {
        return await fn();
    } catch (err) {
        console.error(label, err);
        return fallback;
    }
}
