import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config/env', () => ({
    env: { battle: { workerBatchSize: 10, workerPollIntervalMs: 2000 } },
}));

vi.mock('@features/battle/ledger', () => ({
    claimOutbox: vi.fn(),
    failOutbox: vi.fn(),
    abandonBattle: vi.fn(),
    // Must list every real topic. A missing one is not a smaller map — it registers as an
    // `undefined` key and the dispatcher claims a topic called "undefined".
    OUTBOX_TOPICS: {
        awaitBeacon: 'await-beacon',
        compute: 'compute',
        verify: 'verify',
        sign: 'sign',
        publish: 'publish',
        batch: 'batch',
    },
}));

vi.mock('@features/battle/worker/beacon.worker', () => ({
    processAwaitBeaconMessage: vi.fn(),
}));
vi.mock('@features/battle/worker/compute.worker', () => ({
    processComputeMessage: vi.fn(),
}));
vi.mock('@features/battle/worker/verify.worker', () => ({
    processVerifyMessage: vi.fn(),
}));
vi.mock('@features/battle/worker/sign.worker', () => ({
    processSignMessage: vi.fn(),
}));
vi.mock('@features/battle/worker/publish.worker', () => ({
    processPublishMessage: vi.fn(),
}));

import { abandonBattle, claimOutbox, failOutbox } from '@features/battle/ledger';
import { processAwaitBeaconMessage } from '@features/battle/worker/beacon.worker';
import { processComputeMessage } from '@features/battle/worker/compute.worker';
import { processVerifyMessage } from '@features/battle/worker/verify.worker';
import { runBattleWorkerOnce } from '@features/battle/worker/runner';

const NOW = new Date('2026-07-26T12:00:00.000Z');

beforeEach(() => {
    vi.clearAllMocks();
    // The default: a failure that still has retries left. Tests wanting the last attempt
    // override this.
    vi.mocked(failOutbox).mockResolvedValue({ deadLettered: false, retryAt: new Date(0) });
    vi.mocked(abandonBattle).mockResolvedValue({ abandoned: true, state: 'forfeited' as never });
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
        expect(claimOutbox).toHaveBeenCalledWith(
            ['await-beacon', 'compute', 'verify', 'sign', 'publish'],
            'worker-a',
            10,
            NOW,
        );
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
        // `batch` is a declared topic with no handler: batching aggregates across many
        // receipts on its own schedule rather than per battle, so nothing enqueues it.
        vi.mocked(claimOutbox).mockResolvedValue([
            { id: 'm1', battleId: 'btl_1', topic: 'batch', payload: {}, attempts: 1 },
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


describe('the end of the retry road', () => {
    const dying = (topic: string) => {
        vi.mocked(claimOutbox).mockResolvedValue([
            { id: 'm1', battleId: 'btl_1', topic, payload: {}, attempts: 8 },
        ]);
        vi.mocked(failOutbox).mockResolvedValue({ deadLettered: true, retryAt: null });
    };

    // Locks are released by reaching a terminal state, so a battle left non-terminal keeps
    // both its pets out of the game for good. This is what closes that.
    it('ends the battle when a message dead-letters, freeing its pets', async () => {
        dying('verify');
        vi.mocked(processVerifyMessage).mockRejectedValue(new Error('indexer-go unavailable'));

        await runBattleWorkerOnce('w1');

        expect(abandonBattle).toHaveBeenCalledWith(
            'btl_1',
            expect.stringContaining('verify gave up after 8 attempts'),
        );
    });

    it('leaves the battle alone while retries remain', async () => {
        vi.mocked(claimOutbox).mockResolvedValue([
            { id: 'm1', battleId: 'btl_1', topic: 'verify', payload: {}, attempts: 2 },
        ]);
        vi.mocked(processVerifyMessage).mockRejectedValue(new Error('transient'));

        await runBattleWorkerOnce('w1');

        expect(failOutbox).toHaveBeenCalled();
        expect(abandonBattle).not.toHaveBeenCalled();
    });

    it('also ends one dead-lettered for having no handler at all', async () => {
        dying('nonsense');

        await runBattleWorkerOnce('w1');

        expect(abandonBattle).toHaveBeenCalledWith('btl_1', expect.stringContaining('no handler'));
    });
});
