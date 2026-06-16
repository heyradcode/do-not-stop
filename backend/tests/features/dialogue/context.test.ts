import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@repositories/history.repository', () => ({
    getHeadToHead: vi.fn().mockResolvedValue({ wins: 0, losses: 0 }),
    getRecentForm: vi.fn().mockResolvedValue([]),
}));
vi.mock('@repositories/conversation.repository', () => ({
    getRecentBanter: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../../src/grpc/battleStream', () => ({
    getChainSettledBattle: vi.fn().mockReturnValue(null),
    getChainSettledWinner: vi.fn().mockReturnValue(null),
}));
vi.mock('../../../src/features/dialogue/llm/render', () => ({
    buildBanterContext: vi.fn().mockReturnValue('banter-ctx'),
    buildRivalryContext: vi.fn().mockReturnValue('rivalry-ctx'),
    buildBattleSummaryContext: vi.fn().mockReturnValue('summary-ctx'),
}));

import { buildBanter, buildRivalry, buildBattleIntensity } from '../../../src/features/dialogue/context';
import { getChainSettledBattle } from '../../../src/grpc/battleStream';
import { getRecentBanter } from '@repositories/conversation.repository';

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getChainSettledBattle).mockReturnValue(null);
    vi.mocked(getRecentBanter).mockResolvedValue([]);
});

describe('buildBanter', () => {
    it('returns rendered banter string', async () => {
        const result = await buildBanter('evm', 'pet1', 'pet2');
        expect(result).toBe('banter-ctx');
    });

    it('filters out result-phase turns when tauntsOnly is true', async () => {
        vi.mocked(getRecentBanter).mockResolvedValueOnce([
            { speaker: 'attacker', text: 'Hi', phase: 'taunt' },
            { speaker: 'defender', text: 'GG', phase: 'result' },
        ] as never);
        const { buildBanterContext } = await import('../../../src/features/dialogue/llm/render');
        await buildBanter('evm', 'pet1', 'pet2', undefined, true);
        const passedTurns = vi.mocked(buildBanterContext).mock.calls[0][0] as unknown[];
        expect(passedTurns).toHaveLength(1);
    });

    it('returns empty string when repository throws', async () => {
        vi.mocked(getRecentBanter).mockRejectedValueOnce(new Error('db down'));
        const result = await buildBanter('evm', 'pet1', 'pet2');
        expect(result).toBe('');
    });
});

describe('buildRivalry', () => {
    it('returns rendered rivalry string', async () => {
        const result = await buildRivalry('evm', 'pet1', 'pet2');
        expect(result).toBe('rivalry-ctx');
    });

    it('returns empty string when repository throws', async () => {
        const { getHeadToHead } = await import('@repositories/history.repository');
        vi.mocked(getHeadToHead).mockRejectedValueOnce(new Error('db down'));
        const result = await buildRivalry('evm', 'pet1', 'pet2');
        expect(result).toBe('');
    });
});

describe('buildBattleIntensity', () => {
    it('returns empty string when battleId is missing', () => {
        expect(buildBattleIntensity('evm', undefined)).toBe('');
    });

    it('returns empty string when battle stream has no record', () => {
        expect(buildBattleIntensity('evm', 'battle1')).toBe('');
    });

    it('returns summary when battle is settled on-chain', () => {
        vi.mocked(getChainSettledBattle).mockReturnValue({
            winnerPet: 'p1', loserPet: 'p2', foughtAt: 0, seed: 0n,
            rounds: 5, winnerHpRemaining: 10, xpWin: 20, xpLoss: 5,
        } as never);
        expect(buildBattleIntensity('evm', 'battle1')).toBe('summary-ctx');
    });
});
