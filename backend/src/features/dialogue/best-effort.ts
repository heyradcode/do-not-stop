/**
 * Run a best-effort side effect: on failure, log under the `[dialogue]` prefix
 * and return `fallback` instead of throwing. Used for the feature's non-critical
 * paths (context lookups, transcript/history writes) that must never block or
 * fail a dialogue response.
 */
export async function bestEffort<T>(
    label: string,
    fn: () => Promise<T>,
    fallback: T,
): Promise<T> {
    try {
        return await fn();
    } catch (err) {
        console.error(`[dialogue] ${label}:`, err);
        return fallback;
    }
}
