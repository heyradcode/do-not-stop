// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const parseError = vi.fn((err: unknown, fallback: string) => ({
    message: err instanceof Error ? err.message : fallback,
    isUserRejection: err instanceof Error && err.message.includes('rejected'),
}));

vi.mock('../../src/hooks/useChainCapabilities', () => ({
    useChainCapabilities: () => ({ parseError }),
}));

import { useTxError } from '../../src/hooks/useTxError';

describe('useTxError', () => {
    it('returns null when there is no error', () => {
        const { result } = renderHook(() => useTxError(null));
        expect(result.current).toBeNull();
    });

    it('returns null for undefined', () => {
        const { result } = renderHook(() => useTxError(undefined));
        expect(result.current).toBeNull();
    });

    it('extracts message from an Error', () => {
        const { result } = renderHook(() => useTxError(new Error('mint failed')));
        expect(result.current?.message).toBe('mint failed');
        expect(result.current?.isUserRejection).toBe(false);
    });

    it('flags user rejection errors', () => {
        const { result } = renderHook(() => useTxError(new Error('User rejected the request')));
        expect(result.current?.isUserRejection).toBe(true);
    });

    it('uses the fallback for non-Error values', () => {
        const { result } = renderHook(() => useTxError('oops', 'Custom fallback'));
        expect(result.current?.message).toBe('Custom fallback');
    });
});
