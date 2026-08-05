import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { DialogueTurn, GenerateDialogueInput } from '../../../../src/features/dialogue/dialogue.types';

// --- mocks ---
vi.mock('@repositories/dialogue.repository', () => ({
    getDialogue: vi.fn().mockResolvedValue(null),
    saveDialogue: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@repositories/pregen.repository', () => ({
    getPregenStore: vi.fn().mockResolvedValue({ take: vi.fn().mockResolvedValue(null) }),
}));
vi.mock('../../../../src/features/dialogue/llm/persona', () => ({
    buildPersona: vi.fn((p: { name: string }) => ({ name: p.name })),
}));
vi.mock('../../../../src/features/dialogue/result/turns', () => ({
    generateTurns: vi.fn(),
    ensureResultCoverage: vi.fn((_t: DialogueTurn[]) => _t),
}));
vi.mock('../../../../src/features/dialogue/recording', () => ({
    recordResultLines: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@repositories/history.repository', () => ({
    getSettledWinner: vi.fn().mockResolvedValue(null),
}));
vi.mock('@typings/pregen', () => ({
    matchupKey: vi.fn((_chain: string, a: string, b: string) => `${a}-${b}`),
}));

import { ChainTruthMismatchError, getOrGenerateDialogue } from '../../../../src/features/dialogue/result/result.service';
import { getDialogue } from '@repositories/dialogue.repository';
import { getPregenStore } from '@repositories/pregen.repository';
import { generateTurns } from '../../../../src/features/dialogue/result/turns';

const turns: DialogueTurn[] = [{ speaker: 'attacker', text: 'Fight!', phase: 'result' }];

const input: GenerateDialogueInput = {
    chain: 'evm',
    battleId: 'b1',
    winner: 'attacker',
    attacker: { petId: 'p1', name: 'Rex', level: 5, rarity: 1, winCount: 3, lossCount: 1 },
    defender: { petId: 'p2', name: 'Blaze', level: 4, rarity: 2, winCount: 2, lossCount: 2 },
};

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDialogue).mockResolvedValue(null);
    vi.mocked(getPregenStore).mockResolvedValue({ take: vi.fn().mockResolvedValue(null) } as never);
    vi.mocked(generateTurns).mockResolvedValue({ turns, model: 'claude-3' });
});

describe('getOrGenerateDialogue', () => {
    it('serves from pregen when available for the actual winner', async () => {
        const attackerWins = [{ speaker: 'attacker', text: 'I won!', phase: 'result' }] as DialogueTurn[];
        vi.mocked(getPregenStore).mockResolvedValue({
            take: vi.fn().mockResolvedValue({ attackerWins, defenderWins: [], model: 'pregen-model' }),
        } as never);

        const result = await getOrGenerateDialogue(input);
        expect(result.model).toBe('pregen-model');
        expect(result.cached).toBe(false);
        expect(generateTurns).not.toHaveBeenCalled();
    });

    it('serves from cache when a dialogue row exists', async () => {
        vi.mocked(getDialogue).mockResolvedValue({ turns, model: 'cached-model' });

        const result = await getOrGenerateDialogue(input);
        expect(result.cached).toBe(true);
        expect(result.model).toBe('cached-model');
        expect(generateTurns).not.toHaveBeenCalled();
    });

    it('generates and persists when no cache or pregen', async () => {
        const result = await getOrGenerateDialogue(input);
        expect(generateTurns).toHaveBeenCalledOnce();
        expect(result.cached).toBe(false);
        expect(result.model).toBe('claude-3');
    });

    it('picks defenderWins turns when winner is defender', async () => {
        const defenderWins = [{ speaker: 'defender', text: 'I won!', phase: 'result' }] as DialogueTurn[];
        vi.mocked(getPregenStore).mockResolvedValue({
            take: vi.fn().mockResolvedValue({ attackerWins: [], defenderWins, model: 'pregen-model' }),
        } as never);

        const result = await getOrGenerateDialogue({ ...input, winner: 'defender' });
        expect(result.turns).toBe(defenderWins);
    });

    it('rejects when the client-reported winner contradicts the recorded result', async () => {
        const { getSettledWinner } = await import('@repositories/history.repository');
        // The receipt-written record says p2 (defender) won; the client claims p1.
        vi.mocked(getSettledWinner).mockResolvedValue('p2');

        await expect(getOrGenerateDialogue(input)).rejects.toThrow(ChainTruthMismatchError);
        expect(generateTurns).not.toHaveBeenCalled();
    });
});
