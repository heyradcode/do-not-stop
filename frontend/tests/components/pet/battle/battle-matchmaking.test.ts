import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OpponentPet } from '@shared/core';

import {
    getLevelDelta,
    getMatchLabel,
    getMatchTier,
    pickRandomOpponent,
    sortOpponentsByMatch,
} from '@components/pet/interactions/panels/battle/battle-matchmaking';

const opp = (id: string, level: number): OpponentPet =>
    ({ id, level }) as unknown as OpponentPet;

describe('getLevelDelta', () => {
    it('returns null when there is no fighter', () => {
        expect(getLevelDelta(null, 5)).toBeNull();
    });

    it('returns opponent level minus fighter level', () => {
        expect(getLevelDelta(3, 5)).toBe(2);
        expect(getLevelDelta(7, 5)).toBe(-2);
    });
});

describe('getMatchTier', () => {
    it.each([
        [null, 'unknown'],
        [-2, 'easy'],
        [-5, 'easy'],
        [-1, 'even'],
        [0, 'even'],
        [1, 'even'],
        [2, 'risky'],
        [3, 'risky'],
        [4, 'danger'],
        [9, 'danger'],
    ] as const)('maps delta %s to tier %s', (delta, tier) => {
        expect(getMatchTier(delta)).toBe(tier);
    });
});

describe('getMatchLabel', () => {
    it('returns null for unknown tier or null delta', () => {
        expect(getMatchLabel('unknown', null)).toBeNull();
        expect(getMatchLabel('even', null)).toBeNull();
    });

    it('labels an exact even match', () => {
        expect(getMatchLabel('even', 0)).toBe('Even match');
    });

    it('signs positive and negative deltas', () => {
        expect(getMatchLabel('even', 1)).toBe('+1 lv');
        expect(getMatchLabel('danger', 4)).toBe('+4 lv');
        expect(getMatchLabel('easy', -3)).toBe('-3 lv');
    });
});

describe('pickRandomOpponent', () => {
    afterEach(() => vi.restoreAllMocks());

    it('returns null when there are no opponents', () => {
        expect(pickRandomOpponent([], 5)).toBeNull();
    });

    it('picks the opponent closest in level', () => {
        const opponents = [opp('a', 9), opp('b', 6), opp('c', 1)];
        expect(pickRandomOpponent(opponents, 5)?.id).toBe('b');
    });

    it('chooses from the closest pool when levels tie', () => {
        const opponents = [opp('low', 3), opp('high', 7), opp('far', 12)];
        // Both 'low' and 'high' are distance 2 from level 5; pick the first.
        vi.spyOn(Math, 'random').mockReturnValue(0);
        expect(pickRandomOpponent(opponents, 5)?.id).toBe('low');
    });
});

describe('sortOpponentsByMatch', () => {
    it('returns the list untouched when there is no fighter', () => {
        const opponents = [opp('a', 9), opp('b', 1)];
        expect(sortOpponentsByMatch(opponents, null)).toBe(opponents);
    });

    it('orders by closeness, then by level ascending', () => {
        const opponents = [opp('a', 9), opp('b', 6), opp('c', 4), opp('d', 5)];
        const sorted = sortOpponentsByMatch(opponents, 5).map((o) => o.id);
        // distances: a=4, b=1, c=1, d=0 -> d, then b/c tie broken by level (c=4 < b=6), then a
        expect(sorted).toEqual(['d', 'c', 'b', 'a']);
    });

    it('does not mutate the input array', () => {
        const opponents = [opp('a', 9), opp('b', 1)];
        const copy = [...opponents];
        sortOpponentsByMatch(opponents, 5);
        expect(opponents).toEqual(copy);
    });
});
