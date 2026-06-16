// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const parseError = vi.fn();
vi.mock('../../src/hooks/useChainCapabilities', () => ({
    useChainCapabilities: () => ({ parseError }),
}));

import { usePetError } from '../../src/hooks/usePetError';
import { useTxError } from '../../src/hooks/useTxError';

beforeEach(() => {
    parseError.mockReset();
    parseError.mockReturnValue({
        message: 'parsed error',
        isUserRejection: false,
        isContractError: true,
    });
});

describe('useTxError', () => {
    it('returns null without a write error', () => {
        const { result } = renderHook(() => useTxError(null));

        expect(result.current).toBeNull();
        expect(parseError).not.toHaveBeenCalled();
    });

    it('parses write errors with the default fallback', () => {
        const err = new Error('wallet broke');

        const { result } = renderHook(() => useTxError(err));

        expect(parseError).toHaveBeenCalledWith(err, 'Transaction failed. Please try again.');
        expect(result.current).toEqual({
            message: 'parsed error',
            isUserRejection: false,
        });
    });

    it('passes a custom fallback through to the chain parser', () => {
        const err = new Error('boom');

        renderHook(() => useTxError(err, 'Custom fallback'));

        expect(parseError).toHaveBeenCalledWith(err, 'Custom fallback');
    });
});

describe('usePetError', () => {
    it('prioritizes validation errors over transaction errors', () => {
        const mutationError = new Error('mutation failed');
        const receiptError = new Error('receipt failed');

        const { result } = renderHook(() =>
            usePetError(mutationError, receiptError, 'Name is required', 'Pet action failed'),
        );

        expect(result.current).toEqual({
            message: 'Name is required',
            isUserRejection: false,
            isContractError: false,
        });
        expect(parseError).not.toHaveBeenCalled();
    });

    it('returns an empty state when there are no errors', () => {
        const { result } = renderHook(() => usePetError(null, null, null, 'Pet action failed'));

        expect(result.current).toEqual({
            message: null,
            isUserRejection: false,
            isContractError: false,
        });
        expect(parseError).not.toHaveBeenCalled();
    });

    it('parses receipt errors before mutation errors', () => {
        const mutationError = new Error('mutation failed');
        const receiptError = new Error('receipt failed');

        const { result } = renderHook(() =>
            usePetError(mutationError, receiptError, null, 'Pet action failed'),
        );

        expect(parseError).toHaveBeenCalledWith(receiptError, 'Pet action failed');
        expect(result.current).toEqual({
            message: 'parsed error',
            isUserRejection: false,
            isContractError: true,
        });
    });

    it('falls back to mutation errors when there is no receipt error', () => {
        const mutationError = new Error('mutation failed');

        renderHook(() => usePetError(mutationError, null, null, 'Pet action failed'));

        expect(parseError).toHaveBeenCalledWith(mutationError, 'Pet action failed');
    });
});
