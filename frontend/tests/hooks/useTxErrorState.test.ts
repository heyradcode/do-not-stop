import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useTxErrorState } from '@hooks/useTxErrorState';

describe('useTxErrorState', () => {
    it('starts clean when there is no write error', () => {
        const { result } = renderHook(() => useTxErrorState(undefined));

        expect(result.current.error).toBeNull();
        expect(result.current.isUserRejection).toBe(false);
        expect(result.current.isContractError).toBe(false);
    });

    it('maps a user rejection into state', () => {
        const { result } = renderHook(() =>
            useTxErrorState(new Error('User rejected the request')),
        );

        expect(result.current.error).toBe('Transaction cancelled by user');
        expect(result.current.isUserRejection).toBe(true);
        expect(result.current.isContractError).toBe(false);
    });

    it('flags a contract revert', () => {
        const { result } = renderHook(() =>
            useTxErrorState(new Error('execution reverted: not the owner')),
        );

        expect(result.current.isContractError).toBe(true);
        expect(result.current.isUserRejection).toBe(false);
        expect(result.current.error).toContain('authorized');
    });

    it('picks up a write error that arrives after mount', () => {
        const { result, rerender } = renderHook(
            ({ err }: { err: unknown }) => useTxErrorState(err),
            { initialProps: { err: undefined as unknown } },
        );

        expect(result.current.error).toBeNull();

        rerender({ err: new Error('User denied transaction') });

        expect(result.current.isUserRejection).toBe(true);
    });

    it('resetError clears the state', () => {
        // Stable ref: a fresh Error each render would re-fire the effect and
        // immediately re-populate the state we just reset.
        const writeError = new Error('User rejected');
        const { result } = renderHook(() => useTxErrorState(writeError));

        expect(result.current.isUserRejection).toBe(true);

        act(() => {
            result.current.resetError();
        });

        expect(result.current.error).toBeNull();
        expect(result.current.isUserRejection).toBe(false);
        expect(result.current.isContractError).toBe(false);
    });
});
