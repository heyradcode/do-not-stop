// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

let captured: {
    enabled: boolean;
    onLogs: (logs: unknown[]) => void;
} | undefined;
vi.mock('../../src/hooks/chains/ethereum/usePolledContractEvent', () => ({
    usePolledContractEvent: (config: typeof captured) => {
        captured = config;
    },
}));

import { useWatchEntropyFulfillment } from '../../src/hooks/chains/ethereum/useWatchEntropyFulfillment';

const ENTROPY = '0xentropy' as `0x${string}`;
const GAME_LOGIC = '0xGaMeLoGiC' as `0x${string}`;
const RANDOM = `0x${'ab'.repeat(32)}` as `0x${string}`;

const setup = (over: Partial<Parameters<typeof useWatchEntropyFulfillment>[0]> = {}) => {
    const onFulfilled = vi.fn();
    renderHook(() =>
        useWatchEntropyFulfillment({
            entropyAddress: ENTROPY,
            gameLogicAddress: GAME_LOGIC,
            requestId: 42n,
            onFulfilled,
            ...over,
        }),
    );
    return onFulfilled;
};

const log = (over: Record<string, unknown> = {}) => ({
    args: {
        caller: GAME_LOGIC,
        sequenceNumber: 42n,
        randomNumber: RANDOM,
        callbackFailed: false,
        ...over,
    },
});

beforeEach(() => {
    captured = undefined;
});

describe('useWatchEntropyFulfillment', () => {
    it('is disabled until a request id and both addresses are set', () => {
        setup({ requestId: null });
        expect(captured?.enabled).toBe(false);

        setup();
        expect(captured?.enabled).toBe(true);
    });

    it('fires for a matching reveal (caller case-insensitive)', () => {
        const onFulfilled = setup();
        captured?.onLogs([log({ caller: GAME_LOGIC.toLowerCase() })]);
        expect(onFulfilled).toHaveBeenCalledWith(42n, RANDOM);
    });

    it('ignores a reveal called by a different contract', () => {
        const onFulfilled = setup();
        captured?.onLogs([log({ caller: '0xsomeoneelse' })]);
        expect(onFulfilled).not.toHaveBeenCalled();
    });

    it('ignores a sequence number mismatch', () => {
        const onFulfilled = setup();
        captured?.onLogs([log({ sequenceNumber: 43n })]);
        expect(onFulfilled).not.toHaveBeenCalled();
    });

    it('ignores a reveal whose consumer callback reverted', () => {
        // Only entropyCallback sets GameLogic's `fulfilled`, and settleMint /
        // settleBreed both require it. Acting on a failed callback prompts the
        // player to sign a transaction that reverts with "Entropy not yet
        // fulfilled" — a reveal is not the same thing as a settleable request.
        const onFulfilled = setup();
        captured?.onLogs([log({ callbackFailed: true })]);
        expect(onFulfilled).not.toHaveBeenCalled();
    });

    it('still fires when the reveal carries no callbackFailed field', () => {
        // Absent is not failed: an older Entropy ABI or a partial decode must not
        // silently stall every mint.
        const onFulfilled = setup();
        captured?.onLogs([log({ callbackFailed: undefined })]);
        expect(onFulfilled).toHaveBeenCalledWith(42n, RANDOM);
    });
});
