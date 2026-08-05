import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@repositories/history.repository', () => ({
    getHeadToHead: vi.fn().mockResolvedValue({ wins: 0, losses: 0 }),
    getRecentForm: vi.fn().mockResolvedValue([]),
    getBattleSummary: vi.fn().mockResolvedValue(null),
}));
vi.mock('@repositories/conversation.repository', () => ({
    getRecentBanter: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../../src/features/dialogue/llm/render', () => ({
    buildBanterContext: vi.fn().mockReturnValue('banter-ctx'),
    buildRivalryContext: vi.fn().mockReturnValue('rivalry-ctx'),
    buildBattleSummaryContext: vi.fn().mockReturnValue('summary-ctx'),
}));

import { buildBanter, buildRivalry, buildBattleIntensity } from '../../../src/features/dialogue/context';
import { getBattleSummary } from '@repositories/history.repository';
import { getRecentBanter } from '@repositories/conversation.repository';

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getBattleSummary).mockResolvedValue(null);
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
    it('returns empty string when battleId is missing', async () => {
        await expect(buildBattleIntensity('evm', undefined)).resolves.toBe('');
        expect(getBattleSummary).not.toHaveBeenCalled();
    });

    it('returns empty string when the battle is not on record', async () => {
        await expect(buildBattleIntensity('evm', 'battle1')).resolves.toBe('');
    });

    it('renders the summary recorded from the receipt', async () => {
        vi.mocked(getBattleSummary).mockResolvedValue({
            rounds: 5, winnerHpRemaining: 10, xpWin: 20, xpLoss: 5,
        });
        await expect(buildBattleIntensity('evm', 'battle1')).resolves.toBe('summary-ctx');
    });

    it('degrades to no intensity when the lookup fails, rather than failing generation', async () => {
        vi.mocked(getBattleSummary).mockRejectedValue(new Error('db down'));
        await expect(buildBattleIntensity('evm', 'battle1')).resolves.toBe('');
    });
});
