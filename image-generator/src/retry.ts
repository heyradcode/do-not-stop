/**
 * Retry with exponential backoff, and a semaphore to bound how many generations
 * run at once.
 *
 * Both exist for the same reason: image generation is a paid, rate-limited
 * upstream, and the natural access pattern is bursty. A marketplace crawling a
 * collection's images hits this service with N requests at once, and without a
 * bound that becomes N simultaneous Workers AI calls, most of which come back
 * 429 and surface to the user as a permanent-looking failure.
 *
 * Retrying a 429 is safe: a rejected request was never billed. A 5xx may have
 * been, which is the honest cost of retrying it, and still preferable to failing
 * a request whose result gets cached forever once it succeeds.
 */

export interface RetryOptions {
    /** Total attempts, including the first. 1 disables retrying. */
    attempts: number;
    baseDelayMs: number;
    /** Cap so a Retry-After of an hour cannot pin a request open. */
    maxDelayMs: number;
    /** Injected in tests so backoff does not cost real time. */
    sleep?: (ms: number) => Promise<void>;
    onRetry?: (attempt: number, delayMs: number, error: unknown) => void;
}

export const DEFAULT_RETRY: RetryOptions = {
    attempts: 3,
    baseDelayMs: 500,
    maxDelayMs: 10_000,
};

/** Thrown errors carry this when the failure is worth another attempt. */
export interface RetryableError {
    retryable?: boolean;
    /** Seconds the upstream asked us to wait, from a Retry-After header. */
    retryAfterMs?: number;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryable = (error: unknown): boolean => (error as RetryableError)?.retryable === true;

export const withRetry = async <T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> => {
    const sleep = options.sleep ?? defaultSleep;
    let lastError: unknown;

    for (let attempt = 1; attempt <= Math.max(1, options.attempts); attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            const isLast = attempt >= options.attempts;
            if (isLast || !isRetryable(error)) throw error;

            // Honour Retry-After when the upstream sent one; it knows its own
            // window better than a blind doubling does.
            const asked = (error as RetryableError).retryAfterMs;
            const backoff = options.baseDelayMs * 2 ** (attempt - 1);
            const delay = Math.min(asked ?? backoff, options.maxDelayMs);

            options.onRetry?.(attempt, delay, error);
            await sleep(delay);
        }
    }

    throw lastError;
};

export class DeadlineExceeded extends Error {
    constructor(readonly ms: number) {
        super(`Deadline of ${ms}ms exceeded`);
        this.name = 'DeadlineExceeded';
    }
}

/**
 * Rejects if `work` has not settled within `ms`, WITHOUT cancelling it.
 *
 * That distinction is the point. Generation is paid for and, once started, runs
 * to completion and lands in the store whether or not anyone is still waiting
 * (see pipeline.ts). So giving up on the *response* costs nothing: the caller
 * stops holding a connection open, the work finishes anyway, and the next
 * request for that pet is a cache hit. Cancelling would be the wasteful choice.
 */
export const withDeadline = async <T>(work: Promise<T>, ms: number): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new DeadlineExceeded(ms)), ms);
    });

    try {
        return await Promise.race([work, deadline]);
    } finally {
        // Cleared either way, so a fast response does not keep the process alive
        // waiting on a timer that can no longer matter.
        if (timer) clearTimeout(timer);
    }
};

/**
 * Counting semaphore. Queued callers run FIFO as slots free up.
 *
 * This throttles rather than sheds: a queued request waits instead of failing,
 * because the alternative is telling a user their pet has no image when it is
 * only a few seconds away.
 */
export interface Limiter {
    run<T>(fn: () => Promise<T>): Promise<T>;
    /** Currently executing, for tests and diagnostics. */
    readonly active: number;
    readonly queued: number;
}

export const createLimiter = (max: number): Limiter => {
    const limit = Math.max(1, Math.trunc(max));
    const waiting: (() => void)[] = [];
    let active = 0;

    const release = (): void => {
        active--;
        waiting.shift()?.();
    };

    return {
        get active() {
            return active;
        },
        get queued() {
            return waiting.length;
        },
        async run<T>(fn: () => Promise<T>): Promise<T> {
            if (active >= limit) {
                await new Promise<void>((resolve) => waiting.push(resolve));
            }
            active++;
            try {
                return await fn();
            } finally {
                release();
            }
        },
    };
};
