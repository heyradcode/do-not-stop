import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BattleState } from '@generated/prisma/enums';

/**
 * The transaction client every transition runs against. `$transaction` hands the callback
 * this object, so the tests can assert that the state change, the outbox write, and the
 * lock release all happened against the *same* client, which is what makes them atomic.
 */
const tx = {
    battleLedger: { updateMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    battleOutbox: { createMany: vi.fn() },
    petBattleLock: { create: vi.fn(), deleteMany: vi.fn() },
    battleIntent: { updateMany: vi.fn() },
};

vi.mock('@config/prisma', () => ({
    prisma: {
        $transaction: vi.fn(),
        battleLedger: { findUnique: vi.fn() },
    },
}));

import { prisma } from '@config/prisma';

import {
    applyTransition,
    failBattle,
    IllegalTransitionError,
    openBattle,
    OUTBOX_TOPICS,
    sortPetIds,
} from '@features/battle/ledger';

beforeEach(() => {
    vi.clearAllMocks();
    // Run the callback inline with the fake client, and record the isolation level so the
    // serializable requirement is testable.
    vi.mocked(prisma.$transaction).mockImplementation(((callback: (client: typeof tx) => unknown) =>
        Promise.resolve(callback(tx))) as never);
    tx.battleLedger.updateMany.mockResolvedValue({ count: 1 });
    tx.battleLedger.create.mockResolvedValue({ battleId: 'btl_1', chainId: 'eip155:84532' });
    tx.battleOutbox.createMany.mockResolvedValue({ count: 1 });
    tx.petBattleLock.create.mockResolvedValue({});
    tx.petBattleLock.deleteMany.mockResolvedValue({ count: 2 });
    tx.battleIntent.updateMany.mockResolvedValue({ count: 1 });
});

describe('applyTransition', () => {
    it('advances the state and enqueues in one transaction', async () => {
        const result = await applyTransition({
            battleId: 'btl_1',
            from: BattleState.accepted,
            to: BattleState.committed,
            patch: { drandRound: 1002n },
            outbox: [{ battleId: 'btl_1', topic: OUTBOX_TOPICS.awaitBeacon }],
        });

        expect(result).toEqual({ applied: true, state: BattleState.committed });
        expect(tx.battleLedger.updateMany).toHaveBeenCalledWith({
            where: { battleId: 'btl_1', state: BattleState.accepted },
            data: { drandRound: 1002n, state: BattleState.committed },
        });
        expect(tx.battleOutbox.createMany).toHaveBeenCalledTimes(1);
    });

    it('runs at serializable isolation', async () => {
        await applyTransition({ battleId: 'btl_1', from: BattleState.accepted, to: BattleState.committed });
        expect(vi.mocked(prisma.$transaction).mock.calls[0]![1]).toEqual({ isolationLevel: 'Serializable' });
    });

    it('guards the update on the expected current state', async () => {
        // This guard is the concurrency control: only the caller that finds the battle in
        // `from` gets to move it, so there is no read-then-write race to lose.
        await applyTransition({ battleId: 'btl_1', from: BattleState.seeded, to: BattleState.computed });
        const where = tx.battleLedger.updateMany.mock.calls[0]![0].where;
        expect(where).toEqual({ battleId: 'btl_1', state: BattleState.seeded });
    });

    it('reports a lost race as not applied, with the state that won', async () => {
        tx.battleLedger.updateMany.mockResolvedValue({ count: 0 });
        tx.battleLedger.findUnique.mockResolvedValue({ state: BattleState.computed });

        const result = await applyTransition({
            battleId: 'btl_1',
            from: BattleState.seeded,
            to: BattleState.computed,
            outbox: [{ battleId: 'btl_1', topic: OUTBOX_TOPICS.verify }],
        });

        expect(result).toEqual({ applied: false, state: BattleState.computed });
        // Nothing else may happen on a lost race: enqueueing anyway would double-schedule
        // the follow-up work the winner already scheduled.
        expect(tx.battleOutbox.createMany).not.toHaveBeenCalled();
    });

    it('treats a repeat of the same state as a no-op without touching the database', async () => {
        const result = await applyTransition({
            battleId: 'btl_1',
            from: BattleState.computed,
            to: BattleState.computed,
            outbox: [{ battleId: 'btl_1', topic: OUTBOX_TOPICS.verify }],
        });

        expect(result).toEqual({ applied: false, state: BattleState.computed });
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws for an illegal move rather than silently ignoring it', async () => {
        await expect(
            applyTransition({ battleId: 'btl_1', from: BattleState.committed, to: BattleState.rejected }),
        ).rejects.toBeInstanceOf(IllegalTransitionError);
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws when the battle does not exist', async () => {
        tx.battleLedger.updateMany.mockResolvedValue({ count: 0 });
        tx.battleLedger.findUnique.mockResolvedValue(null);
        await expect(
            applyTransition({ battleId: 'missing', from: BattleState.accepted, to: BattleState.committed }),
        ).rejects.toThrow(/does not exist/);
    });

    it('releases both pet locks on a terminal state', async () => {
        await applyTransition({ battleId: 'btl_1', from: BattleState.published, to: BattleState.batched });
        expect(tx.petBattleLock.deleteMany).toHaveBeenCalledWith({ where: { battleId: 'btl_1' } });
    });

    it('releases locks on a failure terminal state too', async () => {
        // A pet stuck locked because its battle failed is indistinguishable from a pet in a
        // battle, and it would keep the owner from playing.
        await applyTransition({ battleId: 'btl_1', from: BattleState.committed, to: BattleState.forfeited });
        expect(tx.petBattleLock.deleteMany).toHaveBeenCalledWith({ where: { battleId: 'btl_1' } });
    });

    it('keeps locks while a battle is still in flight', async () => {
        await applyTransition({ battleId: 'btl_1', from: BattleState.seeded, to: BattleState.computed });
        expect(tx.petBattleLock.deleteMany).not.toHaveBeenCalled();
    });

    it('skips the outbox write when there is nothing to enqueue', async () => {
        await applyTransition({ battleId: 'btl_1', from: BattleState.signed, to: BattleState.published });
        expect(tx.battleOutbox.createMany).not.toHaveBeenCalled();
    });
});

describe('failBattle', () => {
    it('records why it failed', async () => {
        await failBattle('btl_1', BattleState.computed, BattleState.verification_failed, 'winner mismatch: ts=1 go=2');
        expect(tx.battleLedger.updateMany.mock.calls[0]![0].data).toEqual({
            failureReason: 'winner mismatch: ts=1 go=2',
            state: BattleState.verification_failed,
        });
    });
});

describe('openBattle', () => {
    it('creates the row, locks both pets, and enqueues in one transaction', async () => {
        const result = await openBattle({
            ledger: { chainId: 'eip155:84532' } as never,
            petIds: ['9', '10'],
            outbox: [{ battleId: 'btl_1', topic: OUTBOX_TOPICS.awaitBeacon }],
        });

        expect(result).toEqual({ ok: true, battleId: 'btl_1' });
        expect(tx.battleLedger.create).toHaveBeenCalledTimes(1);
        expect(tx.petBattleLock.create).toHaveBeenCalledTimes(2);
        expect(tx.battleOutbox.createMany).toHaveBeenCalledTimes(1);
        expect(vi.mocked(prisma.$transaction).mock.calls[0]![1]).toEqual({ isolationLevel: 'Serializable' });
    });

    it('takes locks in ascending numeric pet-id order', async () => {
        // Deadlock avoidance: two battles over the same pair contend on the same row first,
        // so one fails cleanly on the primary key instead of both waiting on each other.
        await openBattle({ ledger: { chainId: 'eip155:84532' } as never, petIds: ['10', '9'] });
        const order = tx.petBattleLock.create.mock.calls.map((call) => call[0].data.petId);
        expect(order).toEqual(['9', '10']);
    });

    it('consumes the originating intent in the same transaction, guarded on it not already being spent', async () => {
        await openBattle({
            ledger: { chainId: 'eip155:84532' } as never,
            petIds: ['9', '10'],
            consumeIntentHash: '0xabc',
        });
        expect(tx.battleIntent.updateMany).toHaveBeenCalledWith({
            where: { intentHash: '0xabc', consumedAt: null },
            data: { consumedAt: expect.any(Date) },
        });
    });

    it('aborts without creating a ledger row when the intent was already consumed', async () => {
        // Two accept calls racing on one intent must not both succeed. The abort has to roll
        // back everything in the transaction, not just skip the ledger create.
        tx.battleIntent.updateMany.mockResolvedValue({ count: 0 });
        const result = await openBattle({
            ledger: { chainId: 'eip155:84532' } as never,
            petIds: ['9', '10'],
            consumeIntentHash: '0xabc',
        });
        expect(result).toEqual({ ok: false, reason: 'intent-already-consumed' });
        expect(tx.battleLedger.create).not.toHaveBeenCalled();
    });

    it('reports which pet was already locked, rather than a raw database error', async () => {
        tx.petBattleLock.create.mockResolvedValueOnce({}).mockRejectedValueOnce(
            Object.assign(new Error('unique'), { code: 'P2002' }),
        );
        const result = await openBattle({ ledger: { chainId: 'eip155:84532' } as never, petIds: ['9', '10'] });
        expect(result).toEqual({ ok: false, reason: 'pet-locked', petId: '10' });
    });

    it('rethrows an unexpected lock error rather than reporting a conflict', async () => {
        tx.petBattleLock.create.mockRejectedValueOnce(new Error('connection reset'));
        await expect(
            openBattle({ ledger: { chainId: 'eip155:84532' } as never, petIds: ['9', '10'] }),
        ).rejects.toThrow(/connection reset/);
    });
});

describe('sortPetIds', () => {
    it('sorts numerically, not lexicographically', () => {
        // Pet ids are decimal strings, and "10" < "9" as text. Getting this wrong would give
        // two concurrent battles opposite lock orders, which is the deadlock.
        expect(sortPetIds(['9', '10', '2'])).toEqual(['2', '9', '10']);
    });

    it('handles ids beyond Number.MAX_SAFE_INTEGER', () => {
        const big = '115792089237316195423570985008687907853269984665640564039457584007913129639935';
        expect(sortPetIds([big, '7'])).toEqual(['7', big]);
    });

    it('does not mutate the input', () => {
        const input = ['10', '9'];
        sortPetIds(input);
        expect(input).toEqual(['10', '9']);
    });
});
