import { describe, it, expect, vi, afterEach } from 'vitest';
import { sleep } from '../../../src/utils/common/sleep';

describe('sleep', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('resolves only after the given delay elapses', async () => {
        vi.useFakeTimers();
        const resolved = vi.fn();
        const promise = sleep(1000).then(resolved);

        await vi.advanceTimersByTimeAsync(999);
        expect(resolved).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(1);
        await promise;
        expect(resolved).toHaveBeenCalledOnce();
    });

    it('resolves with undefined', async () => {
        vi.useFakeTimers();
        const promise = sleep(0);
        await vi.advanceTimersByTimeAsync(0);
        await expect(promise).resolves.toBeUndefined();
    });
});
