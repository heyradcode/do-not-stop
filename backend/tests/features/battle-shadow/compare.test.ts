import { describe, expect, it } from 'vitest';

import { compareShadowRun, type ObservedOutcome, type PredictedOutcome } from '@features/battle-shadow';

const PREDICTED: PredictedOutcome = {
    firstWins: true,
    rounds: 7,
    winnerHpRemaining: 42,
    winnerPetId: '1',
    loserPetId: '2',
};

const OBSERVED: ObservedOutcome = { ...PREDICTED };

describe('agreement', () => {
    it('agrees when the engine, the chain, and Go all match', () => {
        expect(compareShadowRun(PREDICTED, OBSERVED, { firstWins: true, rounds: 7, winnerHpRemaining: 42 })).toEqual({
            status: 'agreed',
            mismatches: [],
        });
    });

    it('agrees on the chain alone when Go could not be reached', () => {
        // A missing second opinion is not a disagreement; the chain comparison still stands.
        expect(compareShadowRun(PREDICTED, OBSERVED, null)).toEqual({ status: 'agreed', mismatches: [] });
    });
});

describe('disagreeing with the chain', () => {
    it.each([
        ['firstWins', { firstWins: false, winnerPetId: '2', loserPetId: '1' }],
        ['rounds', { rounds: 8 }],
        ['winnerHpRemaining', { winnerHpRemaining: 41 }],
    ])('flags a %s mismatch', (field, patch) => {
        const result = compareShadowRun(PREDICTED, { ...OBSERVED, ...patch }, null);
        expect(result.status).toBe('mismatch');
        expect(result.mismatches.join(' ')).toContain(field);
    });

    it('checks the winner pet id separately from firstWins', () => {
        // Both agreeing is what proves the engine and the chain also agree on which pet sat
        // in which slot — a swap would otherwise pass on `firstWins` alone.
        const result = compareShadowRun(PREDICTED, { ...OBSERVED, winnerPetId: '99', loserPetId: '98' }, null);
        expect(result.status).toBe('mismatch');
        expect(result.mismatches.join(' ')).toContain('winnerPetId');
        expect(result.mismatches.join(' ')).toContain('loserPetId');
    });

    it('reports every differing field, not just the first', () => {
        const result = compareShadowRun(PREDICTED, { ...OBSERVED, rounds: 9, winnerHpRemaining: 1 }, null);
        expect(result.mismatches).toHaveLength(2);
    });

    it('reports a Go disagreement alongside a chain mismatch rather than hiding it', () => {
        const result = compareShadowRun(
            PREDICTED,
            { ...OBSERVED, rounds: 9 },
            { firstWins: true, rounds: 11, winnerHpRemaining: 42 },
        );
        expect(result.status).toBe('mismatch');
        expect(result.mismatches.join(' ')).toContain('rounds:');
        expect(result.mismatches.join(' ')).toContain('go.rounds:');
    });
});

describe('the two backend engines disagreeing with each other', () => {
    it('is its own status, separate from a chain mismatch', () => {
        // Points at the ports having drifted, not at the chain, and the fix is different.
        const result = compareShadowRun(PREDICTED, OBSERVED, { firstWins: true, rounds: 8, winnerHpRemaining: 42 });
        expect(result.status).toBe('engine-disagreement');
        expect(result.mismatches.join(' ')).toContain('go.rounds');
    });

    it('does not fire when Go simply was not consulted', () => {
        expect(compareShadowRun(PREDICTED, OBSERVED, null).status).toBe('agreed');
    });
});
