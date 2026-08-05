import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@config/prisma', () => ({
    prisma: { battleConversation: { createMany: vi.fn(), findMany: vi.fn() } },
}));

import { recordConversation, getRecentBanter } from '../../../src/repositories/conversation.repository';
import { prisma } from '@config/prisma';
import type { DialogueTurn } from '../../../src/features/dialogue/dialogue.types';

beforeEach(() => { vi.clearAllMocks(); });

const meta = { chain: 'evm' as const, attacker: 'p1', defender: 'p2' };
const turns: DialogueTurn[] = [
    { speaker: 'attacker', text: 'Watch out!', phase: 'taunt' },
    { speaker: 'defender', text: 'Too slow.', phase: 'taunt' },
];

describe('recordConversation', () => {
    it('does nothing when turns is empty', async () => {
        await recordConversation(meta, []);
        expect(prisma.battleConversation.createMany).not.toHaveBeenCalled();
    });

    it('inserts all turns with correct fields', async () => {
        vi.mocked(prisma.battleConversation.createMany).mockResolvedValue({ count: 2 } as never);
        await recordConversation(meta, turns);
        const { data } = prisma.battleConversation.createMany.mock.calls[0][0] as { data: unknown[] };
        expect(data).toHaveLength(2);
        expect(data[0]).toMatchObject({ chain: 'evm', attacker: 'p1', defender: 'p2', speaker: 'attacker', phase: 'taunt' });
    });
});

describe('getRecentBanter', () => {
    it('remaps speaker relative to the current attacker perspective', async () => {
        vi.mocked(prisma.battleConversation.findMany).mockResolvedValue([
            { attacker: 'p2', defender: 'p1', speaker: 'attacker', phase: 'taunt', text: 'Hi' },
        ] as never);
        const result = await getRecentBanter('evm', 'p1', 'p2');
        expect(result[0].speaker).toBe('defender');
    });

    it('keeps attacker speaker when the stored attacker matches the queried attacker', async () => {
        vi.mocked(prisma.battleConversation.findMany).mockResolvedValue([
            { attacker: 'p1', defender: 'p2', speaker: 'attacker', phase: 'taunt', text: 'Yo' },
        ] as never);
        const result = await getRecentBanter('evm', 'p1', 'p2');
        expect(result[0].speaker).toBe('attacker');
    });

    it('returns empty array when no rows exist', async () => {
        vi.mocked(prisma.battleConversation.findMany).mockResolvedValue([]);
        expect(await getRecentBanter('evm', 'p1', 'p2')).toEqual([]);
    });

    it('passes excludeBattleId to the query', async () => {
        vi.mocked(prisma.battleConversation.findMany).mockResolvedValue([]);
        await getRecentBanter('evm', 'p1', 'p2', 6, 'skip-me');
        expect(prisma.battleConversation.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: expect.objectContaining({ battleId: { not: 'skip-me' } }) }),
        );
    });
});
