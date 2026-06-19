// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Keypair } from '@solana/web3.js';
import React from 'react';

// ---------- stubs ----------
const owner = Keypair.generate().publicKey;
const programId = Keypair.generate().publicKey;

const fetchNullable = vi.fn();
const withdrawStudFees = {
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
    error: null as Error | null,
};

vi.mock('../../src/contexts/SolanaAnchorContext', () => ({
    useSolanaAnchor: () => ({ signingWallet: { publicKey: owner } }),
}));

const programStub = { program: {}, programId, isReady: true };
vi.mock('../../src/hooks/chains/solana/useProgram', () => ({
    useProgram: () => programStub,
}));

vi.mock('../../src/utils/solana/accountClient', () => ({
    getAccountClient: () => ({ fetchNullable }),
}));

vi.mock('../../src/hooks/chains/solana/usePetActions', () => ({
    usePetActions: () => ({ withdrawStudFees }),
}));

// Avoid calling PublicKey.findProgramAddressSync in jsdom (crypto compat issues)
const stubPda = [{ toBase58: () => 'StudFeePda11111111111111111' }, 255] as const;
vi.mock('../../src/utils/solana/pdas', () => ({
    studFeeAccountPda: () => stubPda,
}));

import { useStudFees } from '../../src/hooks/useStudFees';

function wrapper({ children }: { children: React.ReactNode }) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return React.createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
    vi.clearAllMocks();
    programStub.isReady = true;
    fetchNullable.mockResolvedValue(null);
    withdrawStudFees.mutateAsync.mockResolvedValue(undefined);
    withdrawStudFees.isPending = false;
    withdrawStudFees.error = null;
});

describe('useStudFees', () => {
    it('amountLamports=null when studFeeAccount does not exist', async () => {
        fetchNullable.mockResolvedValue(null);
        const { result } = renderHook(() => useStudFees(), { wrapper });
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.amountLamports).toBeNull();
    });

    it('amountLamports equals the on-chain amount as bigint', async () => {
        fetchNullable.mockResolvedValue({ amount: 500_000_000 });
        const { result } = renderHook(() => useStudFees(), { wrapper });
        await waitFor(() => expect(result.current.amountLamports).toBe(500_000_000n));
    });

    it('converts bigint amount from on-chain', async () => {
        fetchNullable.mockResolvedValue({ amount: 1_000_000_000n });
        const { result } = renderHook(() => useStudFees(), { wrapper });
        await waitFor(() => expect(result.current.amountLamports).toBe(1_000_000_000n));
    });

    it('withdraw.run delegates to withdrawStudFees.mutateAsync', async () => {
        const { result } = renderHook(() => useStudFees(), { wrapper });
        await result.current.withdraw.run();
        expect(withdrawStudFees.mutateAsync).toHaveBeenCalledOnce();
    });

    it('withdraw.isPending reflects action state', () => {
        withdrawStudFees.isPending = true;
        const { result } = renderHook(() => useStudFees(), { wrapper });
        expect(result.current.withdraw.isPending).toBe(true);
    });

    it('withdraw.error reflects action error', () => {
        withdrawStudFees.error = new Error('withdraw failed');
        const { result } = renderHook(() => useStudFees(), { wrapper });
        expect(result.current.withdraw.error?.message).toBe('withdraw failed');
    });

    it('query is disabled when program is not ready', () => {
        programStub.isReady = false;
        const { result } = renderHook(() => useStudFees(), { wrapper });
        expect(result.current.isLoading).toBe(false);
        expect(fetchNullable).not.toHaveBeenCalled();
    });

    it('exposes a refetch function', () => {
        const { result } = renderHook(() => useStudFees(), { wrapper });
        expect(typeof result.current.refetch).toBe('function');
    });
});
