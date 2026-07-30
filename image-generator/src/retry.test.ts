import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_RETRY, createLimiter, withRetry, type RetryOptions } from './retry.js';

/** Collects the delays instead of waiting them out. */
const fakeClock = () => {
    const delays: number[] = [];
    return {
        delays,
        sleep: async (ms: number) => {
            delays.push(ms);
        },
    };
};

const retryable = (message: string, extra: Record<string, unknown> = {}) =>
    Object.assign(new Error(message), { retryable: true, ...extra });

const options = (overrides: Partial<RetryOptions> = {}): RetryOptions => ({
    ...DEFAULT_RETRY,
    ...overrides,
});

describe('withRetry', () => {
    it('returns the first success without sleeping', async () => {
        const clock = fakeClock();
        const fn = vi.fn(async () => 'ok');

        expect(await withRetry(fn, options({ sleep: clock.sleep }))).toBe('ok');
        expect(fn).toHaveBeenCalledTimes(1);
        expect(clock.delays).toEqual([]);
    });

    it('retries a retryable failure and succeeds', async () => {
        const clock = fakeClock();
        const fn = vi
            .fn()
            .mockRejectedValueOnce(retryable('429'))
            .mockResolvedValueOnce('ok');

        expect(await withRetry(fn, options({ sleep: clock.sleep }))).toBe('ok');
        expect(fn).toHaveBeenCalledTimes(2);
        expect(clock.delays).toEqual([500]);
    });

    it('backs off exponentially', async () => {
        const clock = fakeClock();
        const fn = vi.fn().mockRejectedValue(retryable('429'));

        await expect(
            withRetry(fn, options({ attempts: 4, baseDelayMs: 100, sleep: clock.sleep })),
        ).rejects.toThrow('429');

        expect(fn).toHaveBeenCalledTimes(4);
        expect(clock.delays).toEqual([100, 200, 400]); // no sleep after the last attempt
    });

    it('does not retry a non-retryable failure', async () => {
        const clock = fakeClock();
        // A 400 means the request itself is wrong; retrying burns the same error.
        const fn = vi.fn().mockRejectedValue(new Error('400 bad request'));

        await expect(withRetry(fn, options({ sleep: clock.sleep }))).rejects.toThrow('400');
        expect(fn).toHaveBeenCalledTimes(1);
        expect(clock.delays).toEqual([]);
    });

    it('prefers the upstream Retry-After over its own backoff', async () => {
        const clock = fakeClock();
        const fn = vi
            .fn()
            .mockRejectedValueOnce(retryable('429', { retryAfterMs: 2_500 }))
            .mockResolvedValueOnce('ok');

        await withRetry(fn, options({ baseDelayMs: 100, sleep: clock.sleep }));
        expect(clock.delays).toEqual([2_500]);
    });

    it('caps a hostile Retry-After so a request cannot be pinned open', async () => {
        const clock = fakeClock();
        const fn = vi
            .fn()
            .mockRejectedValueOnce(retryable('429', { retryAfterMs: 3_600_000 }))
            .mockResolvedValueOnce('ok');

        await withRetry(fn, options({ maxDelayMs: 10_000, sleep: clock.sleep }));
        expect(clock.delays).toEqual([10_000]);
    });

    it('attempts once when attempts is 1, and never sleeps', async () => {
        const clock = fakeClock();
        const fn = vi.fn().mockRejectedValue(retryable('429'));

        await expect(withRetry(fn, options({ attempts: 1, sleep: clock.sleep }))).rejects.toThrow('429');
        expect(fn).toHaveBeenCalledTimes(1);
        expect(clock.delays).toEqual([]);
    });

    it('reports each retry to the caller', async () => {
        const clock = fakeClock();
        const onRetry = vi.fn();
        const fn = vi.fn().mockRejectedValueOnce(retryable('429')).mockResolvedValueOnce('ok');

        await withRetry(fn, options({ sleep: clock.sleep, onRetry }));
        expect(onRetry).toHaveBeenCalledTimes(1);
        expect(onRetry.mock.calls[0]![0]).toBe(1);
        expect(onRetry.mock.calls[0]![1]).toBe(500);
    });
});

describe('createLimiter', () => {
    /** A promise whose resolution the test controls. */
    const deferred = () => {
        let resolve!: () => void;
        const promise = new Promise<void>((r) => { resolve = r; });
        return { promise, resolve };
    };

    /** Drains pending microtasks; handing a slot to a queued caller takes several
     *  hops, so counting individual ticks would be guesswork. */
    const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

    it('runs up to the limit at once and queues the rest', async () => {
        const limiter = createLimiter(2);
        const gates = [deferred(), deferred(), deferred()];
        let started = 0;

        const runs = gates.map((gate) =>
            limiter.run(async () => {
                started++;
                await gate.promise;
            }));

        await flush();
        expect(started).toBe(2);
        expect(limiter.active).toBe(2);
        expect(limiter.queued).toBe(1);

        gates[0]!.resolve();
        await flush();
        expect(started).toBe(3); // the queued call took the freed slot

        gates[1]!.resolve();
        gates[2]!.resolve();
        await Promise.all(runs);
        expect(limiter.active).toBe(0);
        expect(limiter.queued).toBe(0);
    });

    it('never exceeds the limit under a burst', async () => {
        const limiter = createLimiter(3);
        let active = 0;
        let peak = 0;

        await Promise.all(
            Array.from({ length: 20 }, () =>
                limiter.run(async () => {
                    active++;
                    peak = Math.max(peak, active);
                    await new Promise((r) => setTimeout(r, 1));
                    active--;
                })),
        );

        expect(peak).toBe(3);
        expect(active).toBe(0);
    });

    it('frees the slot when the task throws, so a failure cannot deadlock it', async () => {
        const limiter = createLimiter(1);

        await expect(limiter.run(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
        expect(limiter.active).toBe(0);
        expect(await limiter.run(async () => 'ok')).toBe('ok');
    });

    it('treats a limit below 1 as 1 rather than blocking forever', async () => {
        const limiter = createLimiter(0);
        expect(await limiter.run(async () => 'ok')).toBe('ok');
    });

    it('returns each task its own result', async () => {
        const limiter = createLimiter(2);
        const results = await Promise.all([1, 2, 3, 4].map((n) => limiter.run(async () => n * 10)));
        expect(results).toEqual([10, 20, 30, 40]);
    });
});
