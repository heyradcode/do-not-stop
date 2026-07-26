import { beforeEach, describe, expect, it, vi } from 'vitest';

import { deriveBattleSeed, QUICKNET, roundTime } from '@cryptopets/protocol';

vi.mock('@config/env', () => ({
    env: { battle: { forfeitAfterSeconds: 300, workerPollIntervalMs: 2000 } },
}));

vi.mock('@config/prisma', () => ({
    prisma: { battleLedger: { findUnique: vi.fn() } },
}));

vi.mock('@features/battle-ledger', () => ({
    applyTransition: vi.fn(),
    completeOutbox: vi.fn(),
    rescheduleOutbox: vi.fn(),
    OUTBOX_TOPICS: { compute: 'compute' },
}));

vi.mock('@features/battle-randomness', () => ({
    fetchVerifiedRound: vi.fn(),
    roundPublishTime: vi.fn((round: number) => new Date(roundTime(QUICKNET, round) * 1000)),
}));

import { prisma } from '@config/prisma';
import { applyTransition, completeOutbox, rescheduleOutbox } from '@features/battle-ledger';
import { fetchVerifiedRound } from '@features/battle-randomness';
import { processAwaitBeaconMessage } from '@features/battle-worker';

const ROUND = 1000;
const PUBLISHED_AT = roundTime(QUICKNET, ROUND);
const BEACON = {
    round: ROUND,
    chainHash: QUICKNET.chainHash,
    signature:
        '0xb44679b9a59af2ec876b1a6b1ad52ea9b1615fc3982b19576350f93447cb1125e342b73a8dd2bacbe47e4b6b63ed5e39',
    randomness: '0xfe290beca10872ef2fb164d2aa4442de4566183ec51c56ff3cd603d930e54fdd',
};

const MESSAGE = { id: 'msg_1', battleId: 'btl_1', topic: 'await-beacon', payload: {}, attempts: 1 };

const BATTLE = {
    battleId: 'btl_1',
    chainId: 'eip155:84532',
    deploymentId: 'base-sepolia-live',
    state: 'committed',
    drandRound: BigInt(ROUND),
    snapshotHash: `0x${'11'.repeat(32)}`,
    rulesetHash: `0x${'22'.repeat(32)}`,
};

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.battleLedger.findUnique).mockResolvedValue(BATTLE as never);
});

describe('the round has verified', () => {
    it('derives the seed, moves to seeded, and enqueues compute', async () => {
        vi.mocked(fetchVerifiedRound).mockResolvedValue({ status: 'verified', beacon: BEACON as never });

        await processAwaitBeaconMessage(MESSAGE, PUBLISHED_AT + 1);

        const call = vi.mocked(applyTransition).mock.calls[0]![0] as {
            from: string;
            to: string;
            patch: { seed: string };
            outbox: { topic: string }[];
        };
        expect(call.from).toBe('committed');
        expect(call.to).toBe('seeded');
        const expectedSeed = deriveBattleSeed({
            domain: { chainId: BATTLE.chainId as never, deploymentId: BATTLE.deploymentId },
            drandRandomness: BEACON.randomness as never,
            battleId: BATTLE.battleId,
            snapshotHash: BATTLE.snapshotHash as never,
            rulesetHash: BATTLE.rulesetHash as never,
        });
        expect(call.patch.seed).toBe(expectedSeed.hex);
        expect(call.outbox[0]!.topic).toBe('compute');
        expect(completeOutbox).toHaveBeenCalledWith('msg_1', expect.any(Date));
    });

    it('never re-derives a different seed for the same message', async () => {
        vi.mocked(fetchVerifiedRound).mockResolvedValue({ status: 'verified', beacon: BEACON as never });
        await processAwaitBeaconMessage(MESSAGE, PUBLISHED_AT + 1);
        await processAwaitBeaconMessage(MESSAGE, PUBLISHED_AT + 5);
        const seeds = vi.mocked(applyTransition).mock.calls.map((c) => (c[0] as { patch: { seed: string } }).patch.seed);
        expect(new Set(seeds).size).toBe(1);
    });
});

describe('the round has not published yet', () => {
    it('reschedules for the round due time and never calls failOutbox-style backoff', async () => {
        vi.mocked(fetchVerifiedRound).mockResolvedValue({ status: 'not-yet-published' });

        await processAwaitBeaconMessage(MESSAGE, PUBLISHED_AT - 1);

        expect(rescheduleOutbox).toHaveBeenCalledWith('msg_1', new Date(PUBLISHED_AT * 1000));
        expect(applyTransition).not.toHaveBeenCalled();
        expect(completeOutbox).not.toHaveBeenCalled();
    });
});

describe('every endpoint is unavailable, within the forfeit window', () => {
    it('reschedules on a short poll interval rather than treating it as a failure', async () => {
        vi.mocked(fetchVerifiedRound).mockResolvedValue({ status: 'unavailable', detail: 'all down' });

        await processAwaitBeaconMessage(MESSAGE, PUBLISHED_AT + 10);

        expect(rescheduleOutbox).toHaveBeenCalledWith('msg_1', new Date((PUBLISHED_AT + 10) * 1000 + 2000));
        expect(applyTransition).not.toHaveBeenCalled();
    });
});

describe('the outage has outlasted the forfeit window', () => {
    it('forfeits rather than waiting forever', async () => {
        vi.mocked(fetchVerifiedRound).mockResolvedValue({ status: 'unavailable', detail: 'all down' });

        await processAwaitBeaconMessage(MESSAGE, PUBLISHED_AT + 301);

        const call = vi.mocked(applyTransition).mock.calls[0]![0] as { from: string; to: string };
        expect(call.from).toBe('committed');
        expect(call.to).toBe('forfeited');
        expect(rescheduleOutbox).not.toHaveBeenCalled();
        expect(completeOutbox).toHaveBeenCalled();
    });

    it('measures the window from the round due time, not from a fixed poll count', async () => {
        // A couple of rounds' offset delay is expected, not an outage; the clock starts only
        // once the round is actually overdue.
        vi.mocked(fetchVerifiedRound).mockResolvedValue({ status: 'not-yet-published' });
        await processAwaitBeaconMessage(MESSAGE, PUBLISHED_AT - 500);
        expect(applyTransition).not.toHaveBeenCalled();
    });
});

describe('idempotence', () => {
    it('completes without acting when the battle has already moved on', async () => {
        vi.mocked(prisma.battleLedger.findUnique).mockResolvedValue({ ...BATTLE, state: 'seeded' } as never);
        await processAwaitBeaconMessage(MESSAGE, PUBLISHED_AT + 1);
        expect(applyTransition).not.toHaveBeenCalled();
        expect(completeOutbox).toHaveBeenCalled();
    });

    it('completes without acting when the battle no longer exists', async () => {
        vi.mocked(prisma.battleLedger.findUnique).mockResolvedValue(null);
        await processAwaitBeaconMessage(MESSAGE, PUBLISHED_AT + 1);
        expect(applyTransition).not.toHaveBeenCalled();
        expect(completeOutbox).toHaveBeenCalled();
    });
});

describe('never substitutes a different round', () => {
    it('always fetches exactly the round the ledger recorded', async () => {
        vi.mocked(fetchVerifiedRound).mockResolvedValue({ status: 'verified', beacon: BEACON as never });
        await processAwaitBeaconMessage(MESSAGE, PUBLISHED_AT + 1);
        expect(fetchVerifiedRound).toHaveBeenCalledWith(ROUND, PUBLISHED_AT + 1);
    });
});
