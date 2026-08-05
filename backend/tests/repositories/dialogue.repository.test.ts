import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@config/prisma', () => ({
    prisma: { battleDialogue: { findUnique: vi.fn(), upsert: vi.fn() } },
}));

import { getDialogue, saveDialogue } from '../../../src/repositories/dialogue.repository';
import { prisma } from '@config/prisma';
import type { DialogueTurn } from '../../../src/features/dialogue/dialogue.types';

const turns: DialogueTurn[] = [
    { speaker: 'attacker', text: 'Ready?', phase: 'taunt' },
    { speaker: 'defender', text: 'Always.', phase: 'result' },
];

beforeEach(() => { vi.clearAllMocks(); });

describe('getDialogue', () => {
    it('returns null when no row exists', async () => {
        vi.mocked(prisma.battleDialogue.findUnique).mockResolvedValue(null);
        expect(await getDialogue('evm', 'b1')).toBeNull();
    });

    it('returns turns and model from the stored row', async () => {
        vi.mocked(prisma.battleDialogue.findUnique).mockResolvedValue({ turns, model: 'gpt-4o' } as never);
        const result = await getDialogue('evm', 'b1');
        expect(result?.model).toBe('gpt-4o');
        expect(result?.turns).toEqual(turns);
    });
});

describe('saveDialogue', () => {
    it('upserts keyed by chain+battleId', async () => {
        vi.mocked(prisma.battleDialogue.upsert).mockResolvedValue({} as never);
        await saveDialogue({ chain: 'evm', battleId: 'b1', attacker: 'p1', defender: 'p2', winner: 'attacker', turns, model: 'gpt-4o' });
        expect(prisma.battleDialogue.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { chain_battleId: { chain: 'evm', battleId: 'b1' } },
            }),
        );
    });
});
