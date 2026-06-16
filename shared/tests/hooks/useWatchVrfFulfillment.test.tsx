// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

type WatchHandler = (logs: { args: { requestId?: bigint } }[]) => void;

let capturedHandler: WatchHandler | null = null;
let watchEnabled = false;

vi.mock('wagmi', () => ({
    useWatchContractEvent: ({ enabled, onLogs }: { enabled: boolean; onLogs: WatchHandler }) => {
        watchEnabled = enabled;
        capturedHandler = onLogs;
    },
}));

import { useWatchVrfFulfillment } from '../../src/hooks/chains/ethereum/useWatchVrfFulfillment';

beforeEach(() => {
    capturedHandler = null;
    watchEnabled = false;
});

describe('useWatchVrfFulfillment', () => {
    it('is disabled when requestId is null', () => {
        renderHook(() => useWatchVrfFulfillment({ coordinator: '0xcoord', requestId: null }));
        expect(watchEnabled).toBe(false);
    });

    it('is disabled when coordinator is missing', () => {
        renderHook(() => useWatchVrfFulfillment({ coordinator: undefined, requestId: 5n }));
        expect(watchEnabled).toBe(false);
    });

    it('is enabled when both coordinator and requestId are set', () => {
        renderHook(() => useWatchVrfFulfillment({ coordinator: '0xcoord', requestId: 5n }));
        expect(watchEnabled).toBe(true);
    });

    it('calls onFulfilled when the matching requestId arrives', () => {
        const onFulfilled = vi.fn();
        renderHook(() => useWatchVrfFulfillment({ coordinator: '0xcoord', requestId: 7n, onFulfilled }));

        capturedHandler!([{ args: { requestId: 7n } }]);
        expect(onFulfilled).toHaveBeenCalledWith(7n);
    });

    it('does not call onFulfilled for a different requestId', () => {
        const onFulfilled = vi.fn();
        renderHook(() => useWatchVrfFulfillment({ coordinator: '0xcoord', requestId: 7n, onFulfilled }));

        capturedHandler!([{ args: { requestId: 99n } }]);
        expect(onFulfilled).not.toHaveBeenCalled();
    });

    it('stops after finding the matching log (does not double-fire)', () => {
        const onFulfilled = vi.fn();
        renderHook(() => useWatchVrfFulfillment({ coordinator: '0xcoord', requestId: 7n, onFulfilled }));

        capturedHandler!([
            { args: { requestId: 7n } },
            { args: { requestId: 7n } },
        ]);
        expect(onFulfilled).toHaveBeenCalledTimes(1);
    });
});
