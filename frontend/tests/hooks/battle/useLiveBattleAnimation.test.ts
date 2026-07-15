import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { StrikeLogEntry } from '@shared/core';
import { useLiveBattleAnimation, describeMechanicalLogEntry } from '@hooks/battle/useLiveBattleAnimation';

function entry(overrides: Partial<StrikeLogEntry>): StrikeLogEntry {
    return {
        round: 0,
        attacker: 1,
        isMagic: false,
        crit: false,
        damage: 10n,
        heal: 0n,
        elementMult: 100,
        furyTriggered: false,
        rebirthTriggered: false,
        hp1After: 90n,
        hp2After: 100n,
        ...overrides,
    };
}

beforeEach(() => {
    vi.useFakeTimers();
});
afterEach(() => {
    vi.useRealTimers();
});

describe('useLiveBattleAnimation', () => {
    it('reports done=true and full HP with no log to animate', () => {
        const { result } = renderHook(() => useLiveBattleAnimation(null, null, null, true));
        expect(result.current).toEqual({
            hp1Percent: 100,
            hp2Percent: 100,
            flourish: null,
            done: true,
            history: [],
            replay: expect.any(Function),
        });
    });

    it('starts at full HP before any strike has played', () => {
        const log = [entry({ hp1After: 90n, hp2After: 80n })];
        const { result } = renderHook(() => useLiveBattleAnimation(log, 100n, 100n, true));
        expect(result.current.hp1Percent).toBe(100);
        expect(result.current.hp2Percent).toBe(100);
        expect(result.current.flourish).toBeNull();
        expect(result.current.done).toBe(false);
    });

    it('plays one strike per interval and reports done once the log is exhausted', () => {
        const log = [
            entry({ attacker: 1, hp1After: 100n, hp2After: 80n }),
            entry({ attacker: 2, hp1After: 90n, hp2After: 80n }),
        ];
        const { result } = renderHook(() => useLiveBattleAnimation(log, 100n, 100n, true));
        expect(result.current.done).toBe(false);
        expect(result.current.history).toEqual([]);

        act(() => { vi.advanceTimersByTime(700); });
        expect(result.current.hp2Percent).toBe(80);
        expect(result.current.done).toBe(false);
        expect(result.current.history).toEqual([log[0]]);

        act(() => { vi.advanceTimersByTime(700); });
        expect(result.current.hp1Percent).toBe(90);
        expect(result.current.done).toBe(true);
        expect(result.current.history).toEqual(log);

        // No further strikes to play; advancing time further changes nothing.
        act(() => { vi.advanceTimersByTime(700); });
        expect(result.current.done).toBe(true);
        expect(result.current.history).toEqual(log);
    });

    it('does not advance while inactive', () => {
        const log = [entry({}), entry({})];
        const { result } = renderHook(() => useLiveBattleAnimation(log, 100n, 100n, false));
        act(() => { vi.advanceTimersByTime(5000); });
        expect(result.current.done).toBe(false);
        expect(result.current.flourish).toBeNull();
    });

    it('describes a critical hit with element advantage', () => {
        const log = [entry({ crit: true, elementMult: 115, isMagic: true })];
        const { result } = renderHook(() => useLiveBattleAnimation(log, 100n, 100n, true));
        act(() => { vi.advanceTimersByTime(700); });
        expect(result.current.flourish).toBe(
            'Your pet lands a magic strike — critical hit! (element advantage)',
        );
    });

    it('describes an opponent strike with Fury and Rebirth flags', () => {
        const log = [entry({ attacker: 2, furyTriggered: true, rebirthTriggered: true })];
        const { result } = renderHook(() => useLiveBattleAnimation(log, 100n, 100n, true));
        act(() => { vi.advanceTimersByTime(700); });
        expect(result.current.flourish).toBe(
            'The opponent lands a physical strike (Fury!) — Rebirth saved a killing blow!',
        );
    });

    it('clamps a percentage that would exceed 100 (heal overshoot guard)', () => {
        const log = [entry({ hp1After: 150n, hp2After: 100n })]; // shouldn't happen, but must not render >100%
        const { result } = renderHook(() => useLiveBattleAnimation(log, 100n, 100n, true));
        act(() => { vi.advanceTimersByTime(700); });
        expect(result.current.hp1Percent).toBe(100);
    });

    it('replay() restarts the same log from the top and plays it again', () => {
        const log = [
            entry({ attacker: 1, hp1After: 100n, hp2After: 80n }),
            entry({ attacker: 2, hp1After: 90n, hp2After: 80n }),
        ];
        const { result } = renderHook(() => useLiveBattleAnimation(log, 100n, 100n, true));

        act(() => { vi.advanceTimersByTime(700); });
        act(() => { vi.advanceTimersByTime(700); }); // play the whole log out
        expect(result.current.done).toBe(true);
        expect(result.current.hp1Percent).toBe(90);

        act(() => { result.current.replay(); });
        expect(result.current.done).toBe(false);
        expect(result.current.hp1Percent).toBe(100); // back to full, nothing played yet
        expect(result.current.history).toEqual([]);

        act(() => { vi.advanceTimersByTime(700); });
        act(() => { vi.advanceTimersByTime(700); }); // plays through again, same log reference
        expect(result.current.done).toBe(true);
        expect(result.current.history).toEqual(log);
    });

    it('restarts from the top when a new log array is provided', () => {
        const log1 = [entry({ hp1After: 50n, hp2After: 100n })];
        const { result, rerender } = renderHook(
            ({ log }: { log: StrikeLogEntry[] }) => useLiveBattleAnimation(log, 100n, 100n, true),
            { initialProps: { log: log1 } },
        );
        act(() => { vi.advanceTimersByTime(700); });
        expect(result.current.hp1Percent).toBe(50);
        expect(result.current.done).toBe(true);

        const log2 = [entry({ hp1After: 100n, hp2After: 60n })];
        rerender({ log: log2 });
        expect(result.current.hp2Percent).toBe(100); // reset to full before the new log's first strike plays
        expect(result.current.done).toBe(false);
    });
});

describe('describeMechanicalLogEntry', () => {
    it('names the attacker/defender and shows damage', () => {
        const line = describeMechanicalLogEntry(entry({ round: 3, damage: 18n }), 'Rex', 'Blaze');
        expect(line).toBe('Round 3 — Rex strikes Blaze for 18 dmg');
    });

    it('flips attacker/defender for the opponent and uses the magic verb', () => {
        const line = describeMechanicalLogEntry(
            entry({ round: 1, attacker: 2, isMagic: true, damage: 5n }),
            'Rex',
            'Blaze',
        );
        expect(line).toBe('Round 1 — Blaze casts on Rex for 5 dmg');
    });

    it('appends crit/element/fury/rebirth/leech tags', () => {
        const line = describeMechanicalLogEntry(
            entry({
                round: 2,
                damage: 20n,
                crit: true,
                elementMult: 115,
                furyTriggered: true,
                rebirthTriggered: true,
                heal: 4n,
            }),
            'Rex',
            'Blaze',
        );
        expect(line).toBe(
            'Round 2 — Rex strikes Blaze for 20 dmg (Crit!, Element adv., Fury!, Rebirth!, +4 HP leeched)',
        );
    });

    it('shows "no damage" when the strike dealt none', () => {
        const line = describeMechanicalLogEntry(entry({ round: 1, damage: 0n }), 'Rex', 'Blaze');
        expect(line).toBe('Round 1 — Rex strikes Blaze for no damage');
    });
});
