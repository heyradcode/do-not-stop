import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@repositories/conversation.repository', () => ({ recordConversation: vi.fn().mockResolvedValue(undefined) }));

import { recordConversationSafe, recordResultLines } from '../../../src/features/dialogue/recording';
import { recordConversation } from '@repositories/conversation.repository';
import type { DialogueTurn, GenerateDialogueInput } from '../../../src/features/dialogue/dialogue.types';

const baseTurns: DialogueTurn[] = [
    { speaker: 'attacker', text: 'Bring it!', phase: 'taunt' },
    { speaker: 'defender', text: 'You asked for it.', phase: 'result' },
];

const baseInput: GenerateDialogueInput = {
    chain: 'evm',
    battleId: 'battle1',
    winner: 'attacker',
    attacker: { petId: 'p1', name: 'Rex', level: 5, rarity: 1, winCount: 3, lossCount: 1 },
    defender: { petId: 'p2', name: 'Blaze', level: 4, rarity: 2, winCount: 2, lossCount: 2 },
};

beforeEach(() => {
    vi.clearAllMocks();
});

describe('recordConversationSafe', () => {
    it('calls recordConversation with the given turns', async () => {
        await recordConversationSafe({ chain: 'evm', attacker: 'p1', defender: 'p2' }, baseTurns);
        expect(recordConversation).toHaveBeenCalledWith(
            { chain: 'evm', attacker: 'p1', defender: 'p2' },
            baseTurns,
        );
    });

    it('swallows errors and resolves without throwing', async () => {
        recordConversation.mockRejectedValueOnce(new Error('db down'));
        await expect(
            recordConversationSafe({ chain: 'evm', attacker: 'p1', defender: 'p2' }, baseTurns),
        ).resolves.toBeUndefined();
    });
});

describe('recordResultLines', () => {
    it('filters to result-phase turns only', async () => {
        await recordResultLines(baseInput, baseTurns);
        const [, calledTurns] = recordConversation.mock.calls[0] as [unknown, DialogueTurn[]];
        expect(calledTurns).toHaveLength(1);
        expect(calledTurns[0].phase).toBe('result');
    });
});
