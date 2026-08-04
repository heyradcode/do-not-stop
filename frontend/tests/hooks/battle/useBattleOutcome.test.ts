import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useBattleOutcome } from '@hooks/battle/useBattleOutcome';

/**
 * The outcome now comes entirely from the verified receipt's progression delta. The old
 * stats-diff path is gone: backend battles never move on-chain win/loss counters, so
 * comparing refreshed chain stats could only ever wait forever.
 */
describe('useBattleOutcome', () => {
    it('starts with no outcome', () => {
        const { result } = renderHook(() => useBattleOutcome());
        expect(result.current.battleOutcome).toBeNull();
    });

    it('resolves a victory from the receipt', () => {
        const { result } = renderHook(() => useBattleOutcome());

        act(() => result.current.applyResolvedOutcome(true, false));

        expect(result.current.battleOutcome).toEqual({ result: 'victory', leveledUp: false });
    });

    it('resolves a defeat from the receipt', () => {
        const { result } = renderHook(() => useBattleOutcome());

        act(() => result.current.applyResolvedOutcome(false, false));

        expect(result.current.battleOutcome).toEqual({ result: 'defeat', leveledUp: false });
    });

    it('carries a level-up through from the receipt rather than inferring it', () => {
        const { result } = renderHook(() => useBattleOutcome());

        act(() => result.current.applyResolvedOutcome(true, true));

        expect(result.current.battleOutcome).toEqual({ result: 'victory', leveledUp: true });
    });

    it('resolves immediately, without waiting on an indexer', () => {
        // The receipt is self-contained, so there is nothing to wait for.
        const { result } = renderHook(() => useBattleOutcome());
        act(() => result.current.applyResolvedOutcome(true, false));
        expect(result.current.battleOutcome).not.toBeNull();
    });

    it('resetOutcome clears a resolved outcome', () => {
        const { result } = renderHook(() => useBattleOutcome());
        act(() => result.current.applyResolvedOutcome(true, true));

        act(() => result.current.resetOutcome());

        expect(result.current.battleOutcome).toBeNull();
    });
});
