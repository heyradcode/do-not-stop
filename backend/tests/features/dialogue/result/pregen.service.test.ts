import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { DialogueTurn } from '../../../../src/features/dialogue/dialogue.types';
import type { Persona } from '../../../../src/features/dialogue/llm/persona';

const store = vi.hoisted(() => ({
    reserve: vi.fn().mockResolvedValue(true),
    fulfill: vi.fn().mockResolvedValue(undefined),
    release: vi.fn().mockResolvedValue(undefined),
    take: vi.fn().mockResolvedValue(null),
}));
vi.mock('@repositories/pregen.repository', () => ({ getPregenStore: vi.fn().mockResolvedValue(store) }));
vi.mock('../../../../src/features/dialogue/result/pregen.types', () => ({
    matchupKey: (_chain: string, a: string, b: string) => `${a}-${b}`,
}));
vi.mock('../../../../src/features/dialogue/llm/render', () => ({
    buildBanterContext: vi.fn().mockReturnValue('banter'),
}));

vi.mock('../../../../src/features/dialogue/result/turns', () => ({
    generateTurns: vi.fn().mockResolvedValue({
        turns: [{ speaker: 'attacker', text: 'I win', phase: 'result' }],
        model: 'test-model',
    }),
    ensureResultCoverage: vi.fn((t: DialogueTurn[]) => t),
}));

const turns: DialogueTurn[] = [{ speaker: 'attacker', text: 'I win', phase: 'result' }];

import { startResultPregen } from '../../../../src/features/dialogue/result/pregen.service';

const attacker: Persona = { name: 'Rex', level: 5, rarity: 1, winCount: 3, lossCount: 1, recentOpponents: [] };
const defender: Persona = { name: 'Blaze', level: 4, rarity: 2, winCount: 2, lossCount: 2, recentOpponents: [] };
const input = {
    chain: 'evm' as const,
    attacker: { petId: 'p1', name: 'Rex', level: 5, rarity: 1, winCount: 3, lossCount: 1 },
    defender: { petId: 'p2', name: 'Blaze', level: 4, rarity: 2, winCount: 2, lossCount: 2 },
};

beforeEach(() => { vi.clearAllMocks(); store.reserve.mockResolvedValue(true); });

describe('startResultPregen', () => {
    it('fires without throwing and reserves the matchup slot', async () => {
        startResultPregen(input, attacker, defender, turns);
        // Give the fire-and-forget promise a tick to settle.
        await new Promise((r) => setTimeout(r, 10));
        expect(store.reserve).toHaveBeenCalledWith('p1-p2');
    });

    it('calls fulfill with both outcome variants', async () => {
        startResultPregen(input, attacker, defender, turns);
        await new Promise((r) => setTimeout(r, 10));
        expect(store.fulfill).toHaveBeenCalledWith(
            'p1-p2',
            expect.objectContaining({ model: 'test-model' }),
        );
    });

    it('skips generation when slot is already reserved', async () => {
        store.reserve.mockResolvedValue(false);
        const { generateTurns } = await import('../../../../src/features/dialogue/result/turns');
        startResultPregen(input, attacker, defender, turns);
        await new Promise((r) => setTimeout(r, 10));
        expect(generateTurns).not.toHaveBeenCalled();
    });

    it('releases the slot when generation throws', async () => {
        const { generateTurns } = await import('../../../../src/features/dialogue/result/turns');
        vi.mocked(generateTurns).mockRejectedValueOnce(new Error('LLM down'));
        startResultPregen(input, attacker, defender, turns);
        await new Promise((r) => setTimeout(r, 10));
        expect(store.release).toHaveBeenCalledWith('p1-p2');
    });
});
