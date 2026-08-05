export interface CircuitBreakerOptions {
    /** Consecutive failures before the breaker opens. */
    threshold: number;
    /** How long an open breaker skips calls before probing again. */
    cooldownMs: number;
    /** Log prefix (e.g. `[roster-grpc]`) for the breaker-open warning. */
    label: string;
}

export interface CircuitBreaker {
    /** Whether a call should be attempted right now (false while the breaker is open). */
    allows(): boolean;
    /** Call on a successful response — resets the consecutive-failure count. */
    recordSuccess(): void;
    /** Call on a failed response — opens the breaker once `threshold` consecutive
     *  failures land, so a dead process stops paying the deadline on every call. */
    recordFailure(reason: string): void;
}

/**
 * Per-client circuit breaker shared by the gRPC read paths to indexer-go
 * (roster reads, win estimate): after `threshold` consecutive failures, skip
 * calls entirely for `cooldownMs` instead of hitting the deadline on every
 * request to a dead process, then probe again.
 */
export function createCircuitBreaker(options: CircuitBreakerOptions): CircuitBreaker {
    const { threshold, cooldownMs, label } = options;
    let consecutiveFailures = 0;
    let breakerOpenUntil = 0;

    return {
        allows(): boolean {
            return Date.now() >= breakerOpenUntil;
        },
        recordSuccess(): void {
            consecutiveFailures = 0;
        },
        recordFailure(reason: string): void {
            consecutiveFailures += 1;
            if (consecutiveFailures >= threshold) {
                breakerOpenUntil = Date.now() + cooldownMs;
                consecutiveFailures = 0;
                console.warn(`${label} breaker open for ${cooldownMs}ms (${reason})`);
            }
        },
    };
}
