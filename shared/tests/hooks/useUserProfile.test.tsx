// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const get = vi.fn();
const apiClient = { get, defaults: { baseURL: 'https://api.test' } };
vi.mock('../../src/contexts/ApiClientContext', () => ({ useApiClient: () => apiClient }));

let adapter: { getToken: () => unknown; removeToken: () => void } | undefined;
vi.mock('../../src/api', () => ({ getStorageAdapter: () => adapter }));

import { useUserProfile } from '../../src/hooks/chains/ethereum/useUserProfile';

const wrapper = ({ children }: { children: React.ReactNode }) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

const flushEffects = () => act(async () => { await Promise.resolve(); });

beforeEach(() => {
    vi.clearAllMocks();
    adapter = undefined;
    get.mockResolvedValue({ data: { address: '0xabc' } });
});

describe('useUserProfile', () => {
    it('stays disabled when there is no storage adapter', async () => {
        renderHook(() => useUserProfile(), { wrapper });
        await flushEffects();
        expect(get).not.toHaveBeenCalled();
    });

    it('stays disabled when the adapter has no token', async () => {
        adapter = { getToken: () => null, removeToken: vi.fn() };
        renderHook(() => useUserProfile(), { wrapper });
        await flushEffects();
        expect(get).not.toHaveBeenCalled();
    });

    it('fetches the profile once a token is present', async () => {
        adapter = { getToken: async () => 'tok', removeToken: vi.fn() };
        const { result } = renderHook(() => useUserProfile(), { wrapper });

        await waitFor(() => expect(result.current.data).toEqual({ address: '0xabc' }));
        expect(get).toHaveBeenCalledWith('/api/protected/profile');
    });
});
