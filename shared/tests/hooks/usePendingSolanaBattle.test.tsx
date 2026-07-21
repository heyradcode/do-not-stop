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
const cancelBattleRpc = vi.fn().mockResolvedValue('cancel-sig');
const getSlot = vi.fn().mockResolvedValue(1000);

vi.mock('../../src/contexts/SolanaAnchorContext', () => ({
    useSolanaAnchor: () => ({
        signingWallet: { publicKey: owner },
        connection: { getSlot },
    }),
}));

const cancelBattleAccounts = vi.fn(() => ({ rpc: cancelBattleRpc }));
const programStub: { program: unknown; programId: PublicKey | null; isReady: boolean } = {
    program: {
        methods: {
            cancelBattle: () => ({
                accounts: cancelBattleAccounts,
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
    battleRequestPda: () => stubPda('BattleReq'),
    globalStatePda: () => stubPda('GlobalState'),
    feeVaultPda: () => stubPda('FeeVault'),
}));

import { usePendingSolanaBattle } from '../../src/hooks/chains/solana/usePendingSolanaBattle';

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
    cancelBattleRpc.mockResolvedValue('cancel-sig');
});

describe('usePendingSolanaBattle', () => {
    it('query is disabled when enabled=false', () => {
        const { result } = renderHook(() => usePendingSolanaBattle(false), { wrapper });
        expect(result.current.isPending).toBe(false);
        expect(fetchNullable).not.toHaveBeenCalled();
    });

    it('query is disabled when program is not ready', () => {
        programStub.isReady = false;
        const { result } = renderHook(() => usePendingSolanaBattle(true), { wrapper });
        expect(result.current.isPending).toBe(false);
        expect(fetchNullable).not.toHaveBeenCalled();
    });

    it('isPending=false when battleRequest PDA is empty', async () => {
        fetchNullable.mockResolvedValue(null);
        const { result } = renderHook(() => usePendingSolanaBattle(), { wrapper });
        await waitFor(() => expect(result.current.isPending).toBe(false));
        expect(result.current.canCancel).toBe(false);
    });

    it('isPending=true when battleRequest exists', async () => {
        fetchNullable
            .mockResolvedValueOnce({ commitSlot: 900, randomnessAccount: PublicKey.default })
            .mockResolvedValue({ randomnessExpirySlots: 50 });
        const { result } = renderHook(() => usePendingSolanaBattle(), { wrapper });
        await waitFor(() => expect(result.current.isPending).toBe(true));
    });

    it('canCancel=false when slot has not exceeded commit+expiry', async () => {
        // commitSlot=900, expirySlots=200 → expires at 1100; currentSlot=1000 < 1100
        fetchNullable
            .mockResolvedValueOnce({ commitSlot: 900, randomnessAccount: PublicKey.default })
            .mockResolvedValue({ randomnessExpirySlots: 200 });
        getSlot.mockResolvedValue(1000);
        const { result } = renderHook(() => usePendingSolanaBattle(), { wrapper });
        await waitFor(() => expect(result.current.isPending).toBe(true));
        expect(result.current.canCancel).toBe(false);
    });

    it('canCancel=true when slot has exceeded commit+expiry', async () => {
        // commitSlot=900, expirySlots=50 → expires at 950; currentSlot=1000 > 950
        fetchNullable
            .mockResolvedValueOnce({ commitSlot: 900, randomnessAccount: PublicKey.default })
            .mockResolvedValue({ randomnessExpirySlots: 50 });
        getSlot.mockResolvedValue(1000);
        const { result } = renderHook(() => usePendingSolanaBattle(), { wrapper });
        await waitFor(() => expect(result.current.canCancel).toBe(true));
    });

    it('cancel.isPending and cancel.error default to false/null', () => {
        const { result } = renderHook(() => usePendingSolanaBattle(), { wrapper });
        expect(result.current.cancel.isPending).toBe(false);
        expect(result.current.cancel.error).toBeNull();
    });

    it('exposes a refetch function', () => {
        const { result } = renderHook(() => usePendingSolanaBattle(), { wrapper });
        expect(typeof result.current.refetch).toBe('function');
    });

    it('cancel.run() passes feeVault + systemProgram so the escrowed battle fee is refunded', async () => {
        const { result } = renderHook(() => usePendingSolanaBattle(), { wrapper });
        await result.current.cancel.run();

        expect(cancelBattleAccounts).toHaveBeenCalledWith(
            expect.objectContaining({
                feeVault: expect.objectContaining({ toBase58: expect.any(Function) }),
                systemProgram: expect.anything(),
            }),
        );
    });
});
