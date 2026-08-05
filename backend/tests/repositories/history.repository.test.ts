import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@config/prisma', () => ({
    prisma: { battleHistory: { upsert: vi.fn(), findMany: vi.fn() } },
}));

import { getHeadToHead, getRecentForm, recordBattleFromReceipt } from '../../../src/repositories/history.repository';
import { prisma } from '@config/prisma';

beforeEach(() => { vi.clearAllMocks(); });

describe('recordBattleFromReceipt', () => {
    const receipt = {
        chain: 'evm' as const,
        battleId: 'b1',
        attacker: 'p1',
        defender: 'p2',
        attackerWon: true,
        foughtAt: 1000,
        seed: '0xseed',
        rounds: 5,
        winnerHpRemaining: 12,
        attackerXp: 20,
        defenderXp: 4,
    };

    function fakeTx() {
        return { battleHistory: { upsert: vi.fn().mockResolvedValue({}) } };
    }

    it('upserts keyed by chain+battleId, so an outbox replay cannot double-count', async () => {
        const tx = fakeTx();
        await recordBattleFromReceipt(tx as never, receipt);
        expect(tx.battleHistory.upsert).toHaveBeenCalledWith(
            expect.objectContaining({ where: { chain_battleId: { chain: 'evm', battleId: 'b1' } } }),
        );
    });

    it('resolves winner and loser to absolute pet ids', async () => {
        // Head-to-head tallies have to survive the same two pets meeting with the roles
        // swapped, so the row stores ids rather than "attacker won".
        const tx = fakeTx();
        await recordBattleFromReceipt(tx as never, receipt);
        const { create } = tx.battleHistory.upsert.mock.calls[0]![0];
        expect(create.winnerPetId).toBe('p1');
        expect(create.loserPetId).toBe('p2');
        expect(create.xpWin).toBe(20);
        expect(create.xpLoss).toBe(4);
    });

    it('flips winner, loser and the xp split when the defender won', async () => {
        const tx = fakeTx();
        await recordBattleFromReceipt(tx as never, { ...receipt, attackerWon: false });
        const { create } = tx.battleHistory.upsert.mock.calls[0]![0];
        expect(create.winnerPetId).toBe('p2');
        expect(create.loserPetId).toBe('p1');
        expect(create.xpWin).toBe(4);
        expect(create.xpLoss).toBe(20);
    });

    it('stores foughtAt as unix seconds', async () => {
        const tx = fakeTx();
        await recordBattleFromReceipt(tx as never, receipt);
        const { create } = tx.battleHistory.upsert.mock.calls[0]![0];
        expect(create.foughtAt).toBe(1000n);
    });

    it('writes on the caller transaction, never the global client', async () => {
        // The row has to commit with the receipt that produced it.
        const tx = fakeTx();
        await recordBattleFromReceipt(tx as never, receipt);
        expect(prisma.battleHistory.upsert).not.toHaveBeenCalled();
    });
});

describe('getHeadToHead', () => {
    it('tallies wins correctly', async () => {
        vi.mocked(prisma.battleHistory.findMany).mockResolvedValue([
            { winnerPetId: 'p1' },
            { winnerPetId: 'p2' },
            { winnerPetId: 'p1' },
        ] as never);
        const result = await getHeadToHead('evm', 'p1', 'p2');
        expect(result.total).toBe(3);
        expect(result.winsByPet['p1']).toBe(2);
        expect(result.winsByPet['p2']).toBe(1);
    });

    it('returns zeros when no history exists', async () => {
        vi.mocked(prisma.battleHistory.findMany).mockResolvedValue([]);
        const result = await getHeadToHead('evm', 'p1', 'p2');
        expect(result.total).toBe(0);
        expect(result.winsByPet['p1']).toBe(0);
    });

    it('excludes the given battleId', async () => {
        vi.mocked(prisma.battleHistory.findMany).mockResolvedValue([]);
        await getHeadToHead('evm', 'p1', 'p2', 'exclude-me');
        expect(prisma.battleHistory.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ battleId: { not: 'exclude-me' } }),
            }),
        );
    });
});

describe('getRecentForm', () => {
    it('counts wins and losses correctly', async () => {
        vi.mocked(prisma.battleHistory.findMany).mockResolvedValue([
            { winnerPetId: 'p1' },
            { winnerPetId: 'p2' },
            { winnerPetId: 'p1' },
        ] as never);
        const result = await getRecentForm('evm', 'p1');
        expect(result.total).toBe(3);
        expect(result.wins).toBe(2);
        expect(result.losses).toBe(1);
    });

    it('returns zeros when no history exists', async () => {
        vi.mocked(prisma.battleHistory.findMany).mockResolvedValue([]);
        const result = await getRecentForm('evm', 'p1');
        expect(result).toEqual({ total: 0, wins: 0, losses: 0 });
    });
});
