import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { StrikeLogEntry } from '@shared/core';
import { useLiveBattleAnimation } from '@hooks/battle/useLiveBattleAnimation';

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
        expect(result.current).toEqual({ hp1Percent: 100, hp2Percent: 100, flourish: null, done: true });
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

        act(() => { vi.advanceTimersByTime(700); });
        expect(result.current.hp2Percent).toBe(80);
        expect(result.current.done).toBe(false);

        act(() => { vi.advanceTimersByTime(700); });
        expect(result.current.hp1Percent).toBe(90);
        expect(result.current.done).toBe(true);

        // No further strikes to play; advancing time further changes nothing.
        act(() => { vi.advanceTimersByTime(700); });
        expect(result.current.done).toBe(true);
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
