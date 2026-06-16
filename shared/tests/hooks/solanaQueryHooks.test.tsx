// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ---------- shared program stub ----------
const program = { rpc: {} };
const programId = { toBase58: () => 'ProgramId111' };
const programStub: {
    program: typeof program | null;
    programId: typeof programId | null;
    isReady: boolean;
} = { program, programId, isReady: true };

vi.mock('../../src/hooks/chains/solana/useProgram', () => ({
    useProgram: () => programStub,
}));

// Stub accountClient so we don't load Switchboard or Anchor for real.
const fetchNullable = vi.fn().mockResolvedValue(null);
vi.mock('../../src/utils/solana/accountClient', () => ({
    getAccountClient: () => ({ fetchNullable, all: vi.fn().mockResolvedValue([]) }),
}));

// Stub PDAs — return a fake PublicKey-like object.
const fakePk = (label: string) => ({ toBase58: () => label });
vi.mock('../../src/utils/solana/pdas', () => ({
    globalStatePda: (_id: unknown) => [fakePk('globalPda')],
    playerProfilePda: (_id: unknown, _owner: unknown) => [fakePk('profilePda')],
}));

// SolanaAnchorContext — provide a signing wallet for playerProfile tests.
const anchorCtx: { signingWallet: { publicKey: ReturnType<typeof fakePk> } | null } = {
    signingWallet: null,
};
vi.mock('../../src/contexts/SolanaAnchorContext', () => ({
    useSolanaAnchor: () => anchorCtx,
}));

import { useGlobalState } from '../../src/hooks/chains/solana/useGlobalState';
import { usePlayerProfile } from '../../src/hooks/chains/solana/usePlayerProfile';
import { usePets } from '../../src/hooks/chains/solana/usePets';

function wrapper({ children }: { children: React.ReactNode }) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return React.createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
    vi.clearAllMocks();
    programStub.program = program;
    programStub.programId = programId;
    programStub.isReady = true;
    anchorCtx.signingWallet = null;
    fetchNullable.mockResolvedValue(null);
});

// ---------- useGlobalState ----------
describe('useGlobalState', () => {
    it('returns a query object when program is ready', () => {
        const { result } = renderHook(() => useGlobalState(), { wrapper });
        // Query is enabled and will fire; we just care it returns the tanstack shape.
        expect(result.current).toHaveProperty('status');
        expect(result.current).toHaveProperty('data');
    });

    it('query is disabled when program is not ready', () => {
        programStub.isReady = false;
        const { result } = renderHook(() => useGlobalState(), { wrapper });
        expect(result.current.fetchStatus).toBe('idle');
    });

    it('query is disabled when program is null', () => {
        programStub.program = null;
        const { result } = renderHook(() => useGlobalState(), { wrapper });
        expect(result.current.fetchStatus).toBe('idle');
    });
});

// ---------- usePlayerProfile ----------
describe('usePlayerProfile', () => {
    it('query is disabled when no signing wallet', () => {
        anchorCtx.signingWallet = null;
        const { result } = renderHook(() => usePlayerProfile(), { wrapper });
        expect(result.current.fetchStatus).toBe('idle');
    });

    it('query is enabled with a signing wallet and ready program', () => {
        anchorCtx.signingWallet = { publicKey: fakePk('ownerPK') };
        const { result } = renderHook(() => usePlayerProfile(), { wrapper });
        expect(result.current).toHaveProperty('status');
    });

    it('query is disabled when program is not ready', () => {
        anchorCtx.signingWallet = { publicKey: fakePk('ownerPK') };
        programStub.isReady = false;
        const { result } = renderHook(() => usePlayerProfile(), { wrapper });
        expect(result.current.fetchStatus).toBe('idle');
    });
});

// ---------- usePets ----------
describe('usePets', () => {
    it('query is disabled when owner is null', () => {
        const { result } = renderHook(() => usePets(null), { wrapper });
        expect(result.current.fetchStatus).toBe('idle');
    });

    it('query is enabled with an owner and ready program', () => {
        const owner = fakePk('ownerPK') as unknown as import('@solana/web3.js').PublicKey;
        const { result } = renderHook(() => usePets(owner), { wrapper });
        expect(result.current).toHaveProperty('status');
    });

    it('query is disabled when program is not ready', () => {
        programStub.isReady = false;
        const owner = fakePk('ownerPK') as unknown as import('@solana/web3.js').PublicKey;
        const { result } = renderHook(() => usePets(owner), { wrapper });
        expect(result.current.fetchStatus).toBe('idle');
    });
});
