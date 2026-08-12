// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const get = vi.fn();
const apiClient = { get };
vi.mock('../../src/contexts/ApiClientContext', () => ({ useApiClient: () => apiClient }));

import { useRewardClaim } from '../../src/hooks/rewards/useRewardClaim';
import { useRewardSeason } from '../../src/hooks/rewards/useRewardSeason';

const wrapper = ({ children }: { children: React.ReactNode }) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { response: { status } });

const CLAIM = {
    seasonId: 1,
    wallet: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    amount: '125',
    merkleRoot: `0x${'11'.repeat(32)}`,
    proof: [`0x${'22'.repeat(32)}`],
    breakdown: { battles: 2 },
};

beforeEach(() => {
    vi.clearAllMocks();
});

describe('useRewardClaim', () => {
    it('does not fetch until both the season and the wallet are known', () => {
        renderHook(() => useRewardClaim(null, CLAIM.wallet), { wrapper });
        renderHook(() => useRewardClaim(1, null), { wrapper });

        expect(get).not.toHaveBeenCalled();
    });

    it('returns the proof for an entitled wallet', async () => {
        get.mockResolvedValue({ data: CLAIM });

        const { result } = renderHook(() => useRewardClaim(1, CLAIM.wallet), { wrapper });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data).toEqual(CLAIM);
        expect(get).toHaveBeenCalledWith(`/api/rewards/seasons/1/claim/${CLAIM.wallet}`);
    });

    // The backend returns one 404 for "unknown season" and "earned nothing" on purpose,
    // so telling them apart is impossible and neither is an error.
    it('reads a 404 as no entitlement rather than a failure', async () => {
        get.mockRejectedValue(httpError(404));

        const { result } = renderHook(() => useRewardClaim(1, CLAIM.wallet), { wrapper });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data).toBeNull();
        expect(result.current.error).toBeNull();
    });

    // The one that matters. Swallowing these would tell a player they earned nothing when
    // the truth is we could not find out — a wrong answer nobody reports as a bug.
    it.each([500, 502, 401, 403])('propagates a %s rather than reporting no entitlement', async (status) => {
        get.mockRejectedValue(httpError(status));

        const { result } = renderHook(() => useRewardClaim(1, CLAIM.wallet), { wrapper });

        await waitFor(() => expect(result.current.isError).toBe(true));
        expect(result.current.data).toBeUndefined();
    });

    it('propagates a network failure with no response at all', async () => {
        get.mockRejectedValue(new Error('Network Error'));

        const { result } = renderHook(() => useRewardClaim(1, CLAIM.wallet), { wrapper });

        await waitFor(() => expect(result.current.isError).toBe(true));
    });

    it('keys the cache by season and wallet, so two wallets do not share a proof', async () => {
        get.mockImplementation((url: string) =>
            Promise.resolve({ data: { ...CLAIM, wallet: url.split('/').pop() } }),
        );

        const a = renderHook(() => useRewardClaim(1, '0xaaa'), { wrapper });
        const b = renderHook(() => useRewardClaim(1, '0xbbb'), { wrapper });

        await waitFor(() => expect(a.result.current.isSuccess).toBe(true));
        await waitFor(() => expect(b.result.current.isSuccess).toBe(true));
        expect(a.result.current.data?.wallet).toBe('0xaaa');
        expect(b.result.current.data?.wallet).toBe('0xbbb');
    });
});

describe('useRewardSeason', () => {
    const SEASON = {
        seasonId: 2,
        chainId: 'solana:devnet',
        deploymentId: 'devnet-live',
        firstSequence: '1',
        lastSequence: '100',
        distributor: 'RewaRDsFhqhVBHrHFHKcnbXPPHUvNSVKWnxNBXjHkVh',
        evmChainId: null,
        chainRef: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
        token: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        merkleRoot: `0x${'33'.repeat(32)}`,
        totalAmount: '125',
        params: { perWin: '100' },
        openedTxHash: null,
        openedAt: null,
    };

    it('does not fetch without a season id', () => {
        renderHook(() => useRewardSeason(null), { wrapper });
        expect(get).not.toHaveBeenCalled();
    });

    // Both chain-identity columns have to survive the trip: a leaf binds the chain, so a
    // client rebuilding the tree needs whichever one this season carries.
    it('carries the chain identity through for a solana season', async () => {
        get.mockResolvedValue({ data: SEASON });

        const { result } = renderHook(() => useRewardSeason(2), { wrapper });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data?.chainRef).toBe(SEASON.chainRef);
        expect(result.current.data?.evmChainId).toBeNull();
    });

    it('carries the numeric chain id through for an evm season', async () => {
        get.mockResolvedValue({ data: { ...SEASON, chainId: 'eip155:84532', evmChainId: 84532, chainRef: null } });

        const { result } = renderHook(() => useRewardSeason(1), { wrapper });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data?.evmChainId).toBe(84532);
        expect(result.current.data?.chainRef).toBeNull();
    });

    // Sequence bounds are bigints on the wire; a number would silently lose precision on a
    // long-running deployment.
    it('keeps the sequence range as strings', async () => {
        get.mockResolvedValue({ data: { ...SEASON, lastSequence: '9007199254740993' } });

        const { result } = renderHook(() => useRewardSeason(2), { wrapper });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data?.lastSequence).toBe('9007199254740993');
    });
});
