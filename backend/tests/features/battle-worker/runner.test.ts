import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config/env', () => ({
    env: { battle: { workerBatchSize: 10, workerPollIntervalMs: 2000 } },
}));

vi.mock('@features/battle-ledger', () => ({
    claimOutbox: vi.fn(),
    failOutbox: vi.fn(),
    OUTBOX_TOPICS: { awaitBeacon: 'await-beacon', compute: 'compute', verify: 'verify' },
}));

vi.mock('@features/battle-worker/beacon.worker', () => ({
    processAwaitBeaconMessage: vi.fn(),
}));
vi.mock('@features/battle-worker/compute.worker', () => ({
    processComputeMessage: vi.fn(),
}));
vi.mock('@features/battle-worker/verify.worker', () => ({
    processVerifyMessage: vi.fn(),
}));

import { claimOutbox, failOutbox } from '@features/battle-ledger';
import { processAwaitBeaconMessage } from '@features/battle-worker/beacon.worker';
import { processComputeMessage } from '@features/battle-worker/compute.worker';
import { runBattleWorkerOnce } from '@features/battle-worker/runner';

const NOW = new Date('2026-07-26T12:00:00.000Z');

beforeEach(() => {
    vi.clearAllMocks();
});

describe('dispatch', () => {
    it('routes each message to its topic handler', async () => {
        vi.mocked(claimOutbox).mockResolvedValue([
            { id: 'm1', battleId: 'btl_1', topic: 'await-beacon', payload: {}, attempts: 1 },
            { id: 'm2', battleId: 'btl_2', topic: 'compute', payload: {}, attempts: 1 },
        ]);

        const result = await runBattleWorkerOnce('worker-a', NOW);

        expect(result).toEqual({ processed: 2 });
        expect(processAwaitBeaconMessage).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'm1' }),
            Math.floor(NOW.getTime() / 1000),
        );
        expect(processComputeMessage).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'm2' }),
            Math.floor(NOW.getTime() / 1000),
        );
    });

    it('claims only the topics this worker owns, with the configured batch size', async () => {
        vi.mocked(claimOutbox).mockResolvedValue([]);
        await runBattleWorkerOnce('worker-a', NOW);
        expect(claimOutbox).toHaveBeenCalledWith(['await-beacon', 'compute', 'verify'], 'worker-a', 10, NOW);
    });

    it('sends a real handler failure through failOutbox for backoff, not a silent swallow', async () => {
        vi.mocked(claimOutbox).mockResolvedValue([
            { id: 'm1', battleId: 'btl_1', topic: 'compute', payload: {}, attempts: 1 },
        ]);
        vi.mocked(processComputeMessage).mockRejectedValue(new Error('kms unreachable'));

        await runBattleWorkerOnce('worker-a', NOW);

        expect(failOutbox).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'm1' }),
            'kms unreachable',
            NOW,
        );
    });

    it('dead-letters a message whose topic has no handler, rather than leaving it claimed forever', async () => {
        vi.mocked(claimOutbox).mockResolvedValue([
            { id: 'm1', battleId: 'btl_1', topic: 'sign', payload: {}, attempts: 1 },
        ]);

        await runBattleWorkerOnce('worker-a', NOW);

        expect(failOutbox).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'm1' }),
            expect.stringContaining('no handler'),
            NOW,
        );
    });

    it('processes nothing when there is nothing due', async () => {
        vi.mocked(claimOutbox).mockResolvedValue([]);
        expect(await runBattleWorkerOnce('worker-a', NOW)).toEqual({ processed: 0 });
    });
});
