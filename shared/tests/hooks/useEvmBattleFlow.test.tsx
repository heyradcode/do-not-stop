// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const ADDRESS = '0xOwner';
const REQUEST_HASH = '0xhash';

const publicClient = { simulateContract: vi.fn() };

vi.mock('viem', () => ({
    parseEventLogs: vi.fn(({ eventName }: { eventName: string }) => {
        if (eventName === 'BattleRandomnessRequested') {
            return [{ args: { requester: ADDRESS, requestId: 5n } }];
        }
        return [];
    }),
}));

vi.mock('wagmi', () => ({
    useAccount: () => ({ address: ADDRESS }),
    usePublicClient: () => publicClient,
    useWaitForTransactionReceipt: (config: { hash?: string }) =>
        (config.hash === REQUEST_HASH ? { data: { logs: [] } } : { data: undefined }),
    // A fresh object every call, matching wagmi's real (non-memoized) useWriteContract —
    // this is what the fallback-timer bug depended on to reproduce.
    useWriteContract: () => ({ writeContract: vi.fn(), data: undefined, error: null, reset: vi.fn() }),
}));

vi.mock('../../src/hooks/chains/ethereum/useLiveBattleSocket', () => ({
    useLiveBattleSocket: () => ({ liveOutcome: null, resolvedResult: null }),
}));

const config = {
    evm: { gameLogic: { address: '0xlogic', abi: [] }, chainId: 1, liveBattleWsUrl: 'ws://test' },
};
vi.mock('../../src/contexts/PetsConfigContext', () => ({ usePetsConfig: () => config }));

import { useEvmBattleFlow } from '../../src/hooks/chains/ethereum/useEvmBattleFlow';

beforeEach(() => {
    vi.clearAllMocks();
    publicClient.simulateContract.mockResolvedValue(undefined);
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe('useEvmBattleFlow fallback timer', () => {
    it('still fires the 60s fallback even if the hook keeps re-rendering in the meantime', async () => {
        const { result, rerender } = renderHook(() =>
            useEvmBattleFlow({ requestHash: REQUEST_HASH, enabled: true }),
        );

        expect(result.current.phase).toBe('awaiting-vrf');

        // Re-render every 15s — comfortably inside the 60s fallback window each time. None of
        // these should reset the countdown. (Regression: useWriteContract() returns a new
        // object every render; that used to flow into the arming effect's deps and reset the
        // 60s timer on every re-render, so the fallback could be pushed out indefinitely.)
        for (let i = 0; i < 4; i++) {
            await vi.advanceTimersByTimeAsync(15_000);
            rerender();
        }

        expect(publicClient.simulateContract).toHaveBeenCalled();
    });
});
