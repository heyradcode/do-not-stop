// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Keypair, PublicKey } from '@solana/web3.js';
import React from 'react';

// ---------- stubs ----------
const owner = Keypair.generate().publicKey;
const programId = Keypair.generate().publicKey;

const fetchNullable = vi.fn();
const cancelBreedRpc = vi.fn().mockResolvedValue('cancel-sig');
const getSlot = vi.fn().mockResolvedValue(1000);

vi.mock('../../src/contexts/SolanaAnchorContext', () => ({
    useSolanaAnchor: () => ({
        signingWallet: { publicKey: owner },
        connection: { getSlot },
    }),
}));

const programStub: { program: unknown; programId: PublicKey | null; isReady: boolean } = {
    program: {
        methods: {
            cancelBreed: () => ({
                accounts: () => ({ rpc: cancelBreedRpc }),
            }),
        },
    },
    programId,
    isReady: true,
};

vi.mock('../../src/hooks/chains/solana/useProgram', () => ({
    useProgram: () => programStub,
}));

vi.mock('../../src/utils/solana/accountClient', () => ({
    getAccountClient: () => ({ fetchNullable }),
}));

// Avoid calling PublicKey.findProgramAddressSync in jsdom (crypto compat issues)
const stubPda = (name: string) => [{ toBase58: () => `${name}11111111111111111` }, 255] as const;
vi.mock('../../src/utils/solana/pdas', () => ({
    breedRequestPda: () => stubPda('BreedReq'),
    globalStatePda: () => stubPda('GlobalState'),
    studFeeAccountPda: () => stubPda('StudFee'),
}));

import { usePendingSolanaBreed } from '../../src/hooks/chains/solana/usePendingSolanaBreed';

function wrapper({ children }: { children: React.ReactNode }) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return React.createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
    vi.clearAllMocks();
    programStub.isReady = true;
    programStub.programId = programId;
    fetchNullable.mockResolvedValue(null);
    getSlot.mockResolvedValue(1000);
    cancelBreedRpc.mockResolvedValue('cancel-sig');
});

describe('usePendingSolanaBreed', () => {
    it('query is disabled when enabled=false', () => {
        const { result } = renderHook(() => usePendingSolanaBreed(false), { wrapper });
        expect(result.current.isPending).toBe(false);
        expect(fetchNullable).not.toHaveBeenCalled();
    });

    it('query is disabled when program is not ready', () => {
        programStub.isReady = false;
        const { result } = renderHook(() => usePendingSolanaBreed(true), { wrapper });
        expect(result.current.isPending).toBe(false);
        expect(fetchNullable).not.toHaveBeenCalled();
    });

    it('isPending=false when breedRequest PDA is empty', async () => {
        fetchNullable.mockResolvedValue(null);
        const { result } = renderHook(() => usePendingSolanaBreed(), { wrapper });
        await waitFor(() => expect(result.current.isPending).toBe(false));
        expect(result.current.canCancel).toBe(false);
    });

    it('isPending=true when breedRequest exists', async () => {
        fetchNullable
            .mockResolvedValueOnce({
                commitSlot: 900,
                otherOwner: PublicKey.default,
                randomnessAccount: PublicKey.default,
            })
            .mockResolvedValue({ randomnessExpirySlots: 50 });
        const { result } = renderHook(() => usePendingSolanaBreed(), { wrapper });
        await waitFor(() => expect(result.current.isPending).toBe(true));
    });

    it('canCancel=false when slot has not exceeded commit+expiry', async () => {
        // commitSlot=900, expirySlots=200 → expires at 1100; currentSlot=1000 < 1100
        fetchNullable
            .mockResolvedValueOnce({
                commitSlot: 900,
                otherOwner: PublicKey.default,
                randomnessAccount: PublicKey.default,
            })
            .mockResolvedValue({ randomnessExpirySlots: 200 });
        getSlot.mockResolvedValue(1000);
        const { result } = renderHook(() => usePendingSolanaBreed(), { wrapper });
        await waitFor(() => expect(result.current.isPending).toBe(true));
        expect(result.current.canCancel).toBe(false);
    });

    it('canCancel=true when slot has exceeded commit+expiry', async () => {
        // commitSlot=900, expirySlots=50 → expires at 950; currentSlot=1000 > 950
        fetchNullable
            .mockResolvedValueOnce({
                commitSlot: 900,
                otherOwner: PublicKey.default,
                randomnessAccount: PublicKey.default,
            })
            .mockResolvedValue({ randomnessExpirySlots: 50 });
        getSlot.mockResolvedValue(1000);
        const { result } = renderHook(() => usePendingSolanaBreed(), { wrapper });
        await waitFor(() => expect(result.current.canCancel).toBe(true));
    });

    it('cancel.isPending and cancel.error default to false/null', () => {
        const { result } = renderHook(() => usePendingSolanaBreed(), { wrapper });
        expect(result.current.cancel.isPending).toBe(false);
        expect(result.current.cancel.error).toBeNull();
    });

    it('exposes a refetch function', () => {
        const { result } = renderHook(() => usePendingSolanaBreed(), { wrapper });
        expect(typeof result.current.refetch).toBe('function');
    });
});
