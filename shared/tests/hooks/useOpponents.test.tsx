// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const post = vi.fn();
const apiClient = { post, defaults: { baseURL: 'https://api.test' } };
const auth = { isAuthenticated: true };
vi.mock('../../src/contexts/ApiClientContext', () => ({ useApiClient: () => apiClient }));
vi.mock('../../src/contexts/AuthContext', () => ({ useAuth: () => auth }));

import { useOpponents } from '../../src/hooks/useOpponents';

const dto = {
    id: 'o1',
    chain: 'evm',
    owner: '0xowner',
    name: 'Foe',
    dna: '42',
    level: 5,
    rarity: 2,
    winCount: 1,
    lossCount: 0,
    readyAt: 0,
};

const wrapper = ({ children }: { children: React.ReactNode }) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

beforeEach(() => {
    vi.clearAllMocks();
    auth.isAuthenticated = true;
    post.mockResolvedValue({ data: { data: { opponents: { opponents: [dto], total: 1, page: 0, pageSize: 20 } } } });
});

describe('useOpponents', () => {
    it('does not fetch without a chain', () => {
        const { result } = renderHook(() => useOpponents({ chain: null }), { wrapper });
        expect(post).not.toHaveBeenCalled();
        expect(result.current.opponents).toEqual([]);
    });

    it('does not fetch when unauthenticated', () => {
        auth.isAuthenticated = false;
        renderHook(() => useOpponents({ chain: 'evm' }), { wrapper });
        expect(post).not.toHaveBeenCalled();
    });

    it('queries graphql and maps dtos to OpponentPet (dna as bigint)', async () => {
        const { result } = renderHook(() => useOpponents({ chain: 'evm', minLevel: 3 }), { wrapper });

        await waitFor(() => expect(result.current.opponents).toHaveLength(1));

        expect(post).toHaveBeenCalledWith(
            '/graphql',
            expect.objectContaining({ variables: { chain: 'evm', minLevel: 3, page: 0 } }),
        );
        expect(result.current.opponents[0]).toMatchObject({ id: 'o1', dna: 42n, level: 5 });
        expect(result.current.total).toBe(1);
    });

    it('surfaces graphql errors', async () => {
        post.mockResolvedValue({ data: { errors: [{ message: 'bad query' }] } });
        const { result } = renderHook(() => useOpponents({ chain: 'evm' }), { wrapper });

        await waitFor(() => expect(result.current.isError).toBe(true));
        expect(result.current.error?.message).toBe('bad query');
    });
});
