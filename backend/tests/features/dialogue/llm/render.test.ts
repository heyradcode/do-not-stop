import { describe, it, expect } from 'vitest';
import { buildRivalryContext, buildBanterContext } from '../../../../src/features/dialogue/llm/render';
import type { HeadToHead, RecentForm } from '../../../../src/repositories/history.repository';
import type { DialogueTurn } from '../../../../src/features/dialogue/dialogue.types';

const form = (wins: number, losses: number): RecentForm => ({ total: wins + losses, wins, losses });

describe('buildRivalryContext', () => {
    const ATT = 'attacker-pet';
    const DEF = 'defender-pet';

    it('reports a first meeting when there is no head-to-head history', () => {
        const h2h: HeadToHead = { total: 0, winsByPet: {} };
        const ctx = buildRivalryContext(h2h, form(0, 0), form(0, 0), ATT, DEF);
        expect(ctx).toContain('First meeting between these two.');
        expect(ctx).toContain('Form: fighter A no recent battles, fighter B no recent battles.');
    });

    it('reports an even split when both have equal wins', () => {
        const h2h: HeadToHead = { total: 4, winsByPet: { [ATT]: 2, [DEF]: 2 } };
        const ctx = buildRivalryContext(h2h, form(1, 1), form(2, 0), ATT, DEF);
        expect(ctx).toContain('They have met 4 times — evenly split 2-2.');
    });

    it('names fighter A as leader when the attacker leads', () => {
        const h2h: HeadToHead = { total: 5, winsByPet: { [ATT]: 4, [DEF]: 1 } };
        const ctx = buildRivalryContext(h2h, form(3, 1), form(1, 3), ATT, DEF);
        expect(ctx).toContain('fighter A leads 4-1.');
    });

    it('names fighter B as leader when the defender leads', () => {
        const h2h: HeadToHead = { total: 5, winsByPet: { [ATT]: 1, [DEF]: 4 } };
        const ctx = buildRivalryContext(h2h, form(0, 0), form(0, 0), ATT, DEF);
        expect(ctx).toContain('fighter B leads 4-1.');
    });

    it('treats a pet missing from winsByPet as zero wins', () => {
        const h2h: HeadToHead = { total: 3, winsByPet: { [ATT]: 3 } };
        const ctx = buildRivalryContext(h2h, form(0, 0), form(0, 0), ATT, DEF);
        expect(ctx).toContain('fighter A leads 3-0.');
    });

    it('summarizes recent form for both fighters', () => {
        const h2h: HeadToHead = { total: 0, winsByPet: {} };
        const ctx = buildRivalryContext(h2h, form(3, 2), form(1, 0), ATT, DEF);
        expect(ctx).toContain('Form: fighter A 3W-2L recently, fighter B 1W-0L recently.');
    });
});

describe('buildBanterContext', () => {
    it('labels each turn by fighter and joins with newlines', () => {
        const turns: DialogueTurn[] = [
            { speaker: 'attacker', phase: 'taunt', text: 'Bring it.' },
            { speaker: 'defender', phase: 'taunt', text: 'Gladly.' },
        ];
        expect(buildBanterContext(turns)).toBe('fighter A: Bring it.\nfighter B: Gladly.');
    });

    it('returns an empty string for no turns', () => {
        expect(buildBanterContext([])).toBe('');
    });
});
