import { describe, it, expect } from 'vitest';
import {
    TurnSchema,
    ResponseSchema,
    ResultRequestSchema,
    MAX_TURN_CHARS,
} from '../../../src/features/dialogue/dialogue.schema';

describe('TurnSchema', () => {
    it('normalizes defender aliases to "defender"', () => {
        for (const speaker of ['defender', 'fighter_b', 'b', 'opponent', 'OPPONENT', ' B ']) {
            expect(TurnSchema.parse({ speaker, phase: 'taunt', text: 'hi' }).speaker).toBe('defender');
        }
    });

    it('treats every other speaker as "attacker"', () => {
        for (const speaker of ['attacker', 'a', 'fighter_a', 'anything']) {
            expect(TurnSchema.parse({ speaker, phase: 'taunt', text: 'hi' }).speaker).toBe('attacker');
        }
    });

    it('collapses any phase other than "result" to "taunt"', () => {
        expect(TurnSchema.parse({ speaker: 'a', phase: 'result', text: 'x' }).phase).toBe('result');
        expect(TurnSchema.parse({ speaker: 'a', phase: 'banter', text: 'x' }).phase).toBe('taunt');
        expect(TurnSchema.parse({ speaker: 'a', phase: '', text: 'x' }).phase).toBe('taunt');
    });

    it('trims and truncates text to MAX_TURN_CHARS', () => {
        const long = 'z'.repeat(MAX_TURN_CHARS + 50);
        expect(TurnSchema.parse({ speaker: 'a', phase: 'taunt', text: `  ${long}  ` }).text).toHaveLength(
            MAX_TURN_CHARS,
        );
    });

    it('rejects empty text', () => {
        expect(() => TurnSchema.parse({ speaker: 'a', phase: 'taunt', text: '' })).toThrow();
    });
});

describe('ResponseSchema', () => {
    it('accepts a non-empty turns array (no upper bound)', () => {
        const turns = Array.from({ length: 20 }, () => ({ speaker: 'a', phase: 'taunt', text: 'go' }));
        expect(ResponseSchema.parse({ turns }).turns).toHaveLength(20);
    });

    it('rejects an empty turns array', () => {
        expect(() => ResponseSchema.parse({ turns: [] })).toThrow();
    });
});

describe('ResultRequestSchema', () => {
    const base = {
        chain: 'evm',
        battleId: 'battle-1',
        attacker: { petId: '1', name: 'A', level: 1, rarity: 1, dna: '0', winCount: 0, lossCount: 0 },
        defender: { petId: '2', name: 'B', level: 1, rarity: 1, dna: '1', winCount: 0, lossCount: 0 },
        winner: 'attacker',
    };

    it('accepts a valid result request', () => {
        expect(ResultRequestSchema.parse(base)).toMatchObject({ chain: 'evm', winner: 'attacker' });
    });

    it('rejects an unsupported chain', () => {
        expect(() => ResultRequestSchema.parse({ ...base, chain: 'bitcoin' })).toThrow();
    });

    it('rejects an empty battleId and an invalid winner', () => {
        expect(() => ResultRequestSchema.parse({ ...base, battleId: '' })).toThrow();
        expect(() => ResultRequestSchema.parse({ ...base, winner: 'nobody' })).toThrow();
    });

    it('drops a non-boolean leveledUp instead of rejecting (catch -> undefined)', () => {
        const parsed = ResultRequestSchema.parse({ ...base, leveledUp: 'yes' });
        expect(parsed.leveledUp).toBeUndefined();
    });

    it('keeps a valid boolean leveledUp', () => {
        expect(ResultRequestSchema.parse({ ...base, leveledUp: true }).leveledUp).toBe(true);
    });
});
