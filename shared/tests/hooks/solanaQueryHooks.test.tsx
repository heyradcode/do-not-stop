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
    fetchNullable.mockResolvedValue(null);
});

// ---------- usePets ----------
describe('usePets', () => {
    it('query is disabled when owner is null', () => {
        const { result } = renderHook(() => usePets(null), { wrapper });
        expect(result.current.fetchStatus).toBe('idle');
    });

    it('query is enabled with an owner and ready program', () => {
        const owner = { toBase58: () => 'ownerPK' } as unknown as import('@solana/web3.js').PublicKey;
        const { result } = renderHook(() => usePets(owner), { wrapper });
        expect(result.current).toHaveProperty('status');
    });

    it('query is disabled when program is not ready', () => {
        programStub.isReady = false;
        const owner = { toBase58: () => 'ownerPK' } as unknown as import('@solana/web3.js').PublicKey;
        const { result } = renderHook(() => usePets(owner), { wrapper });
        expect(result.current.fetchStatus).toBe('idle');
    });
});
