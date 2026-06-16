import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@repositories/history.repository', () => ({ recordBattle: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@repositories/conversation.repository', () => ({ recordConversation: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../../src/grpc/battleStream', () => ({
    getChainSettledBattle: vi.fn().mockReturnValue(null),
}));

import { recordConversationSafe, recordResultLines, recordBattleHistory } from '../../../src/features/dialogue/recording';
import { getChainSettledBattle } from '../../../src/grpc/battleStream';
import { recordConversation } from '@repositories/conversation.repository';
import { recordBattle } from '@repositories/history.repository';
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
    vi.mocked(getChainSettledBattle).mockReturnValue(null);
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

describe('recordBattleHistory', () => {
    it('records the attacker as winner when winner=attacker', async () => {
        await recordBattleHistory(baseInput);
        expect(recordBattle).toHaveBeenCalledWith(
            expect.objectContaining({ winnerPetId: 'p1' }),
        );
    });

    it('records the defender as winner when winner=defender', async () => {
        await recordBattleHistory({ ...baseInput, winner: 'defender' });
        expect(recordBattle).toHaveBeenCalledWith(
            expect.objectContaining({ winnerPetId: 'p2' }),
        );
    });

    it('augments record with chain truth when battle stream has the battle', async () => {
        vi.mocked(getChainSettledBattle).mockReturnValue({
            winnerPet: 'p1', loserPet: 'p2', foughtAt: 1000000,
            seed: 42n, rounds: 6, winnerHpRemaining: 8, xpWin: 30, xpLoss: 10,
        } as never);
        await recordBattleHistory(baseInput);
        expect(recordBattle).toHaveBeenCalledWith(
            expect.objectContaining({ seed: 42n, rounds: 6 }),
        );
    });

    it('swallows repository errors', async () => {
        recordBattle.mockRejectedValueOnce(new Error('db down'));
        await expect(recordBattleHistory(baseInput)).resolves.toBeUndefined();
    });
});
