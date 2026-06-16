// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const post = vi.fn();
const apiClient = { post };
vi.mock('../../src/contexts/ApiClientContext', () => ({ useApiClient: () => apiClient }));

import {
    setTokenSuccessCallback,
    useVerifySignature,
} from '../../src/hooks/chains/ethereum/useVerifySignature';

const params = { address: '0xabc', signature: '0xsig', nonce: 'n1', chainId: 1 };

const wrapper = ({ children }: { children: React.ReactNode }) => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

beforeEach(() => {
    vi.clearAllMocks();
    setTokenSuccessCallback(vi.fn());
});

describe('useVerifySignature', () => {
    it('posts the verify payload and returns the data', async () => {
        post.mockResolvedValue({ data: { success: true, token: 't', user: {} } });
        const { result } = renderHook(() => useVerifySignature(), { wrapper });

        let data: unknown;
        await act(async () => {
            data = await result.current.mutateAsync(params);
        });

        expect(post).toHaveBeenCalledWith('/api/auth/verify', params);
        expect(data).toMatchObject({ success: true, token: 't' });
    });

    it('invokes the token success callback when verification succeeds', async () => {
        const callback = vi.fn();
        setTokenSuccessCallback(callback);
        post.mockResolvedValue({ data: { success: true, token: 't', user: {} } });

        const { result } = renderHook(() => useVerifySignature(), { wrapper });
        await act(async () => {
            await result.current.mutateAsync(params);
        });

        expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('does not invoke the callback when success is false', async () => {
        const callback = vi.fn();
        setTokenSuccessCallback(callback);
        post.mockResolvedValue({ data: { success: false } });

        const { result } = renderHook(() => useVerifySignature(), { wrapper });
        await act(async () => {
            await result.current.mutateAsync(params);
        });

        expect(callback).not.toHaveBeenCalled();
    });
});
