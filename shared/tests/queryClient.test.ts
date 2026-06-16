import { QueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { describe, expect, it } from 'vitest';
import { queryClient } from '../src/queryClient';

const queryRetry = () => {
    const retry = queryClient.getDefaultOptions().queries?.retry;
    if (typeof retry !== 'function') {
        throw new Error('Expected query retry to be a function');
    }
    return retry;
};

const unauthorizedError = () => {
    const error = new AxiosError('Unauthorized');
    Object.defineProperty(error, 'response', {
        value: { status: 401 },
    });
    return error;
};

describe('queryClient', () => {
    it('is a QueryClient singleton with five minute stale queries', () => {
        expect(queryClient).toBeInstanceOf(QueryClient);
        expect(queryClient.getDefaultOptions().queries?.staleTime).toBe(5 * 60 * 1000);
    });

    it('does not retry unauthorized query errors', () => {
        expect(queryRetry()(0, unauthorizedError())).toBe(false);
    });

    it('retries other query errors fewer than three times', () => {
        const retry = queryRetry();

        expect(retry(0, new Error('network'))).toBe(true);
        expect(retry(2, new Error('network'))).toBe(true);
        expect(retry(3, new Error('network'))).toBe(false);
    });

    it('does not retry mutations by default', () => {
        expect(queryClient.getDefaultOptions().mutations?.retry).toBe(false);
    });
});
