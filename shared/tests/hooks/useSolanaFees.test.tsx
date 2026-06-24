// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ---- program stub ----
const programId = { toBase58: () => 'ProgramId111' };
const programStub: { program: object | null; programId: typeof programId | null; isReady: boolean } = {
    program: {},
    programId,
    isReady: true,
};
vi.mock('../../src/hooks/chains/solana/useProgram', () => ({
    useProgram: () => programStub,
}));

// ---- wallet stub ----
const mockPublicKey = { toBase58: () => 'ownerPK' };
const walletStub: { signingWallet: { publicKey: typeof mockPublicKey } | null } = {
    signingWallet: { publicKey: mockPublicKey },
};
vi.mock('../../src/contexts/SolanaAnchorContext', () => ({
    useSolanaAnchor: () => walletStub,
}));

// ---- PDA stubs ----
const fakePda = { toBase58: () => 'fakePDA' };
vi.mock('../../src/utils/solana/pdas', () => ({
    globalStatePda: () => [fakePda, 0],
    playerProfilePda: () => [fakePda, 0],
}));

// ---- account client stubs ----
const globalStateData = {
    baseMintFeeLamports: 20_000_000,
    levelUpFeeLamports:   4_000_000,
    breedFeeLamports:    10_000_000,
    trainFeeLamports:    10_000_000,
    studFeeLamports:     20_000_000,
};
const playerProfileData = { mintCount: 2 };

const fetchGS = vi.fn().mockResolvedValue(globalStateData);
const fetchPP = vi.fn().mockResolvedValue(playerProfileData);

vi.mock('../../src/utils/solana/accountClient', () => ({
    getAccountClient: (_prog: unknown, name: string) => ({
        fetch:         vi.fn(),
        fetchNullable: name === 'globalState' ? fetchGS : name === 'playerProfile' ? fetchPP : vi.fn().mockResolvedValue(null),
    }),
}));

import { useSolanaFees } from '../../src/hooks/chains/solana/useSolanaFees';

function wrapper({ children }: { children: React.ReactNode }) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return React.createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
    vi.clearAllMocks();
    programStub.program = {};
    programStub.programId = programId;
    programStub.isReady = true;
    walletStub.signingWallet = { publicKey: mockPublicKey };
    fetchGS.mockResolvedValue(globalStateData);
    fetchPP.mockResolvedValue(playerProfileData);
});

describe('useSolanaFees', () => {
    it('returns all fee fields from GlobalState as bigints', async () => {
        const { result } = renderHook(() => useSolanaFees(true), { wrapper });

        await waitFor(() => expect(result.current.trainFeeLamports).toBeDefined());

        expect(result.current.baseMintFeeLamports).toBe(20_000_000n);
        expect(result.current.levelUpFeeLamports).toBe(4_000_000n);
        expect(result.current.breedFeeLamports).toBe(10_000_000n);
        expect(result.current.trainFeeLamports).toBe(10_000_000n);
        expect(result.current.studFeeLamports).toBe(20_000_000n);
    });

    it('computes nextMintFeeLamports as baseMintFee << min(mintCount, 7)', async () => {
        // mintCount = 2 → baseMintFee << 2 = 20_000_000 * 4
        const { result } = renderHook(() => useSolanaFees(true), { wrapper });

        await waitFor(() => expect(result.current.nextMintFeeLamports).toBeDefined());

        expect(result.current.walletMintCount).toBe(2);
        expect(result.current.nextMintFeeLamports).toBe(80_000_000n);
    });

    it('caps mint fee escalation at 7 doublings (128x)', async () => {
        fetchPP.mockResolvedValue({ mintCount: 10 });
        const { result } = renderHook(() => useSolanaFees(true), { wrapper });

        await waitFor(() => expect(result.current.nextMintFeeLamports).toBeDefined());

        // min(10, 7) = 7 → 20_000_000 << 7 = 20_000_000 * 128
        expect(result.current.nextMintFeeLamports).toBe(2_560_000_000n);
    });

    it('defaults mintCount to 0 when PlayerProfile does not exist', async () => {
        fetchPP.mockResolvedValue(null);
        const { result } = renderHook(() => useSolanaFees(true), { wrapper });

        await waitFor(() => expect(result.current.nextMintFeeLamports).toBeDefined());

        expect(result.current.walletMintCount).toBe(0);
        expect(result.current.nextMintFeeLamports).toBe(20_000_000n); // << 0 = no shift
    });

    it('returns all undefined when disabled', () => {
        const { result } = renderHook(() => useSolanaFees(false), { wrapper });

        expect(result.current.baseMintFeeLamports).toBeUndefined();
        expect(result.current.trainFeeLamports).toBeUndefined();
        expect(result.current.nextMintFeeLamports).toBeUndefined();
    });

    it('returns all undefined when program is not ready', () => {
        programStub.isReady = false;
        const { result } = renderHook(() => useSolanaFees(true), { wrapper });

        expect(result.current.baseMintFeeLamports).toBeUndefined();
        expect(result.current.nextMintFeeLamports).toBeUndefined();
    });
});
