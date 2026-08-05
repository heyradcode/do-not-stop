import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCircuitBreaker } from '../../src/grpc/circuitBreaker';

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe('createCircuitBreaker', () => {
    it('allows calls before any failure', () => {
        const breaker = createCircuitBreaker({ threshold: 3, cooldownMs: 1_000, label: '[test]' });
        expect(breaker.allows()).toBe(true);
    });

    it('stays closed below the failure threshold', () => {
        const breaker = createCircuitBreaker({ threshold: 3, cooldownMs: 1_000, label: '[test]' });
        breaker.recordFailure('boom');
        breaker.recordFailure('boom');
        expect(breaker.allows()).toBe(true);
    });

    it('opens once consecutive failures reach the threshold', () => {
        const breaker = createCircuitBreaker({ threshold: 3, cooldownMs: 1_000, label: '[test]' });
        breaker.recordFailure('boom');
        breaker.recordFailure('boom');
        breaker.recordFailure('boom');
        expect(breaker.allows()).toBe(false);
    });

    it('logs the label and reason when it opens', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const breaker = createCircuitBreaker({ threshold: 1, cooldownMs: 1_000, label: '[test-grpc]' });
        breaker.recordFailure('connection refused');
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('[test-grpc] breaker open for 1000ms (connection refused)'),
        );
        warnSpy.mockRestore();
    });

    it('closes again once the cooldown elapses', () => {
        const breaker = createCircuitBreaker({ threshold: 1, cooldownMs: 1_000, label: '[test]' });
        breaker.recordFailure('boom');
        expect(breaker.allows()).toBe(false);

        vi.advanceTimersByTime(999);
        expect(breaker.allows()).toBe(false);

        vi.advanceTimersByTime(1);
        expect(breaker.allows()).toBe(true);
    });

    it('recordSuccess resets the consecutive-failure count', () => {
        const breaker = createCircuitBreaker({ threshold: 3, cooldownMs: 1_000, label: '[test]' });
        breaker.recordFailure('boom');
        breaker.recordFailure('boom');
        breaker.recordSuccess();
        breaker.recordFailure('boom');
        breaker.recordFailure('boom');
        // Only 2 consecutive failures since the reset — still below threshold 3.
        expect(breaker.allows()).toBe(true);
    });

    it('re-opens on a fresh run of consecutive failures after the cooldown closes it', () => {
        const breaker = createCircuitBreaker({ threshold: 2, cooldownMs: 500, label: '[test]' });
        breaker.recordFailure('boom');
        breaker.recordFailure('boom');
        expect(breaker.allows()).toBe(false);

        vi.advanceTimersByTime(500);
        expect(breaker.allows()).toBe(true);

        breaker.recordFailure('boom');
        breaker.recordFailure('boom');
        expect(breaker.allows()).toBe(false);
    });
});
