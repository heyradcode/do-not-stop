// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

let captured: {
    enabled: boolean;
    onLogs: (logs: unknown[]) => void;
} | undefined;
vi.mock('wagmi', () => ({
    useWatchContractEvent: (config: typeof captured) => {
        captured = config;
    },
}));

import { useWatchPetsContract } from '../../src/hooks/chains/ethereum/useWatchPetsContract';

const ADDRESS = '0xabc' as `0x${string}`;

const setup = (over: Partial<Parameters<typeof useWatchPetsContract>[0]> = {}) => {
    const onBreedSuccess = vi.fn();
    renderHook(() =>
        useWatchPetsContract({
            contractAddress: '0xcontract' as `0x${string}`,
            abi: [],
            address: ADDRESS,
            pendingRequestId: 5n,
            onBreedSuccess,
            ...over,
        }),
    );
    return onBreedSuccess;
};

const log = (over: Record<string, unknown> = {}) => ({
    args: { owner: '0xABC', childId: 9n, requestId: 5n, ...over },
});

beforeEach(() => {
    captured = undefined;
});

describe('useWatchPetsContract', () => {
    it('is disabled until a pending request, address and contract are all set', () => {
        setup({ pendingRequestId: null });
        expect(captured?.enabled).toBe(false);

        setup();
        expect(captured?.enabled).toBe(true);
    });

    it('fires onBreedSuccess for a matching log (owner case-insensitive)', () => {
        const onBreedSuccess = setup();

        captured?.onLogs([log()]);

        expect(onBreedSuccess).toHaveBeenCalledWith({
            owner: '0xABC',
            childId: 9n,
            requestId: 5n,
        });
    });

    it('ignores logs from a different owner', () => {
        const onBreedSuccess = setup();
        captured?.onLogs([log({ owner: '0xother' })]);
        expect(onBreedSuccess).not.toHaveBeenCalled();
    });

    it('ignores a request id mismatch', () => {
        const onBreedSuccess = setup();
        captured?.onLogs([log({ requestId: 99n })]);
        expect(onBreedSuccess).not.toHaveBeenCalled();
    });

    it('ignores logs with no child id', () => {
        const onBreedSuccess = setup();
        captured?.onLogs([log({ childId: undefined })]);
        expect(onBreedSuccess).not.toHaveBeenCalled();
    });
});
