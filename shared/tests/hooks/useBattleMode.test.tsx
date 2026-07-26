// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const configQuery = vi.hoisted(() => ({
    current: { data: undefined as unknown, isLoading: false, isError: false },
}));

vi.mock('../../src/hooks/useBattleConfig', () => ({ useBattleConfig: () => configQuery.current }));

import { useBattleMode } from '../../src/hooks/useBattleMode';

const CONFIG = {
    enabled: true,
    deploymentId: 'base-sepolia-live',
    chainIds: ['eip155:84532'],
    ruleset: { hash: '0xabc', version: 1 },
};

beforeEach(() => {
    configQuery.current = { data: CONFIG, isLoading: false, isError: false };
});

describe('useBattleMode', () => {
    it('uses the backend path when the deployment accepts backend battles', () => {
        const { result } = renderHook(() => useBattleMode());
        expect(result.current).toEqual({ mode: 'backend', isLoading: false, isResolved: true });
    });

    it('uses the on-chain path when the deployment says it is not accepting them', () => {
        configQuery.current = { data: { ...CONFIG, enabled: false }, isLoading: false, isError: false };
        const { result } = renderHook(() => useBattleMode());
        expect(result.current.mode).toBe('onchain');
        expect(result.current.isResolved).toBe(true);
    });

    it('falls back to on-chain while the answer is still loading', () => {
        // The on-chain path always works. Guessing the other way would offer a player a
        // battle this deployment cannot actually run.
        configQuery.current = { data: undefined, isLoading: true, isError: false };
        const { result } = renderHook(() => useBattleMode());
        expect(result.current).toEqual({ mode: 'onchain', isLoading: true, isResolved: false });
    });

    it('falls back to on-chain when the config request failed', () => {
        configQuery.current = { data: undefined, isLoading: false, isError: true };
        const { result } = renderHook(() => useBattleMode());
        expect(result.current.mode).toBe('onchain');
        expect(result.current.isResolved).toBe(false);
    });

    it('does not report resolved on a stale cache alongside an error', () => {
        // An error with data still in cache must not read as a confident answer.
        configQuery.current = { data: CONFIG, isLoading: false, isError: true };
        const { result } = renderHook(() => useBattleMode());
        expect(result.current.mode).toBe('onchain');
        expect(result.current.isResolved).toBe(false);
    });
});
