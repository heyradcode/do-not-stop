import { describe, expect, it } from 'vitest';
import { type BattleSummary, buildBattleSummaryContext } from '../../../../src/features/dialogue/llm/render';

function battle(overrides: Partial<BattleSummary>): BattleSummary {
    return { rounds: 5, winnerHpRemaining: 10, xpWin: 20, xpLoss: 5, ...overrides };
}

describe('buildBattleSummaryContext', () => {
    it('omits intensity clause when rounds <= 0', () => {
        const result = buildBattleSummaryContext(battle({ rounds: 0 }));
        expect(result).not.toContain('bout');
        expect(result).not.toContain('rounds');
    });

    it('describes a swift bout for rounds <= 3', () => {
        expect(buildBattleSummaryContext(battle({ rounds: 2 }))).toContain('swift');
    });

    it('uses singular "round" when rounds === 1', () => {
        expect(buildBattleSummaryContext(battle({ rounds: 1 }))).toContain('1 round.');
    });

    it('describes a grueling war for rounds >= 10', () => {
        expect(buildBattleSummaryContext(battle({ rounds: 12 }))).toContain('grueling war');
    });

    it('describes back-and-forth for moderate rounds', () => {
        expect(buildBattleSummaryContext(battle({ rounds: 6 }))).toContain('back-and-forth');
    });

    it('includes winner HP when > 0', () => {
        expect(buildBattleSummaryContext(battle({ winnerHpRemaining: 8 }))).toContain('8 HP left');
    });

    it('omits HP margin when winnerHpRemaining is 0', () => {
        expect(buildBattleSummaryContext(battle({ winnerHpRemaining: 0 }))).not.toContain('HP left');
    });

    it('includes XP stakes when present', () => {
        const result = buildBattleSummaryContext(battle({ xpWin: 30, xpLoss: 10 }));
        expect(result).toContain('+30');
        expect(result).toContain('+10');
    });

    it('omits XP stakes when both are zero', () => {
        expect(buildBattleSummaryContext(battle({ xpWin: 0, xpLoss: 0 }))).not.toContain('XP');
    });
});
