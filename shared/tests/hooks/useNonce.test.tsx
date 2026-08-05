// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiClient = {
    defaults: { baseURL: 'https://api.test' },
    get: vi.fn(),
};

vi.mock('../../src/contexts/ApiClientContext', () => ({
    useApiClient: () => apiClient,
}));

import { useNonce } from '../../src/hooks/session/useNonce';

const makeWrapper = () => {
    const client = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
        },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    return { client, wrapper };
};

beforeEach(() => {
    vi.clearAllMocks();
    apiClient.defaults.baseURL = 'https://api.test';
});

describe('useNonce', () => {
    it('does not fetch until manually refetched', () => {
        const { wrapper } = makeWrapper();
        const { result } = renderHook(() => useNonce(), { wrapper });

        expect(result.current.isNonceLoading).toBe(false);
        expect(apiClient.get).not.toHaveBeenCalled();
    });

    it('fetches and returns a nonce from the auth API', async () => {
        const { wrapper } = makeWrapper();
        apiClient.get.mockResolvedValueOnce({ data: { nonce: 'nonce-123' } });
        const { result } = renderHook(() => useNonce(), { wrapper });

        await act(async () => {
            await result.current.refetch();
        });

        expect(apiClient.get).toHaveBeenCalledWith('/api/auth/nonce');
        await waitFor(() => expect(result.current.data).toEqual({ nonce: 'nonce-123' }));
    });

    it('rejects empty nonce responses', async () => {
        const { wrapper } = makeWrapper();
        apiClient.get.mockResolvedValue({ data: { nonce: '' } });
        const { result } = renderHook(() => useNonce(), { wrapper });

        await act(async () => {
            await result.current.refetch();
        });

        await waitFor(() =>
            expect(result.current.error).toEqual(new Error('Invalid nonce response from server')),
        );
    });

    it('scopes the query key by API base URL', async () => {
        const { client, wrapper } = makeWrapper();
        apiClient.get.mockResolvedValueOnce({ data: { nonce: 'nonce-123' } });
        const { result, rerender } = renderHook(() => useNonce(), { wrapper });

        await act(async () => {
            await result.current.refetch();
        });

        apiClient.defaults.baseURL = 'https://other-api.test';
        rerender();

        apiClient.get.mockResolvedValueOnce({ data: { nonce: 'other-nonce' } });
        await act(async () => {
            await result.current.refetch();
        });

        expect(apiClient.get).toHaveBeenCalledWith('/api/auth/nonce');
        await waitFor(() => expect(result.current.data).toEqual({ nonce: 'other-nonce' }));
        expect(client.getQueryData(['nonce', 'https://api.test'])).toEqual({ nonce: 'nonce-123' });
        expect(client.getQueryData(['nonce', 'https://other-api.test'])).toEqual({
            nonce: 'other-nonce',
        });
    });
});
