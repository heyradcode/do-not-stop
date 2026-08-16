// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const publicClient = {
    getBlockNumber: vi.fn(),
    getContractEvents: vi.fn(),
};
vi.mock('wagmi', () => ({ usePublicClient: () => publicClient }));

import { usePolledContractEvent } from '../../src/hooks/chains/ethereum/usePolledContractEvent';

const ADDRESS = '0xcontract' as `0x${string}`;

const setup = (onLogs: (logs: unknown[]) => void, fromBlock?: bigint) =>
    renderHook(() =>
        usePolledContractEvent({
            address: ADDRESS,
            abi: [],
            eventName: 'Revealed',
            enabled: true,
            fromBlock,
            onLogs: onLogs as never,
        }),
    );

/** Lets the hook's async tick chain settle between fake-timer advances. */
const flush = async () => {
    for (let i = 0; i < 12; i++) await Promise.resolve();
};

const spans = () =>
    publicClient.getContractEvents.mock.calls.map(
        ([a]: [{ fromBlock: bigint; toBlock: bigint }]) => [a.fromBlock, a.toBlock],
    );

beforeEach(() => {
    vi.useFakeTimers();
    publicClient.getBlockNumber.mockReset();
    publicClient.getContractEvents.mockReset();
    publicClient.getContractEvents.mockResolvedValue([]);
});

afterEach(() => {
    vi.useRealTimers();
});

describe('usePolledContractEvent', () => {
    it('starts from the next block, so it does not replay chain history', async () => {
        publicClient.getBlockNumber.mockResolvedValue(1000n);
        setup(vi.fn());
        await flush();

        // First tick only establishes the watermark.
        expect(publicClient.getContractEvents).not.toHaveBeenCalled();

        publicClient.getBlockNumber.mockResolvedValue(1004n);
        await vi.advanceTimersByTimeAsync(4_000);
        await flush();

        expect(spans()).toEqual([[1001n, 1004n]]);
    });

    it('never asks for a span wider than the public RPC accepts', async () => {
        publicClient.getBlockNumber.mockResolvedValue(1000n);
        setup(vi.fn());
        await flush();

        // A long stall, then a poll: the backlog is far wider than the cap.
        publicClient.getBlockNumber.mockResolvedValue(3000n);
        await vi.advanceTimersByTimeAsync(4_000);
        await flush();

        const widest = spans().reduce(
            (max, [from, to]) => (to - from + 1n > max ? to - from + 1n : max),
            0n,
        );
        expect(widest).toBeLessThanOrEqual(450n);
        // The whole backlog is still covered, contiguously.
        expect(spans()[0]![0]).toBe(1001n);
        expect(spans()[spans().length - 1]![1]).toBe(3000n);
    });

    it('keeps the progress a partly-failed poll already made', async () => {
        // The regression this guards: fromBlock used to stay put whenever a poll
        // threw, so the requested span grew every tick until it passed the RPC's
        // cap, after which every poll failed for the same reason and no log was
        // ever delivered again. Silent — the caller just waits forever.
        publicClient.getBlockNumber.mockResolvedValue(1000n);
        setup(vi.fn());
        await flush();

        publicClient.getContractEvents
            .mockResolvedValueOnce([])                        // 1001-1450 reads fine
            .mockRejectedValueOnce(new Error('rpc blip'));    // next chunk fails

        publicClient.getBlockNumber.mockResolvedValue(2000n);
        await vi.advanceTimersByTimeAsync(4_000);
        await flush();

        publicClient.getContractEvents.mockResolvedValue([]);
        await vi.advanceTimersByTimeAsync(4_000);
        await flush();

        // Resumes at the first unread block, not back at 1001.
        const afterFailure = spans().slice(2);
        expect(afterFailure[0]![0]).toBe(1451n);
    });

    it('reads from a given start block, catching an event that already fired', async () => {
        // The regression this guards: the watch used to begin at `latest + 1`, so
        // anything emitted before it mounted was invisible. A mint cannot arm its
        // watch until the request receipt confirms and React re-renders, by which
        // time Pyth Entropy has usually already revealed a block or two after the
        // request. The reveal was therefore missed on nearly every mint, and the
        // flow sat on "awaiting randomness" forever with the fee already spent.
        publicClient.getBlockNumber.mockResolvedValue(1003n);
        const onLogs = vi.fn();
        publicClient.getContractEvents.mockResolvedValue([{ args: { sequenceNumber: 7n } }]);

        setup(onLogs, 1000n); // request landed in 1000, three blocks back
        await flush();

        // No watermark-only first tick: the backlog is read immediately.
        expect(spans()).toEqual([[1000n, 1003n]]);
        expect(onLogs).toHaveBeenCalledTimes(1);
    });

    it('delivers logs to the latest callback without restarting the poll', async () => {
        publicClient.getBlockNumber.mockResolvedValue(1000n);
        const onLogs = vi.fn();
        setup(onLogs);
        await flush();

        publicClient.getContractEvents.mockResolvedValue([{ args: { sequenceNumber: 7n } }]);
        publicClient.getBlockNumber.mockResolvedValue(1002n);
        await vi.advanceTimersByTimeAsync(4_000);
        await flush();

        expect(onLogs).toHaveBeenCalledTimes(1);
        expect(onLogs.mock.calls[0]![0]).toHaveLength(1);
    });
});
