// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { fetchIdl, ProgramCtor, AnchorProviderCtor } = vi.hoisted(() => ({
    fetchIdl: vi.fn(),
    ProgramCtor: vi.fn(),
    AnchorProviderCtor: vi.fn(),
}));
vi.mock('@coral-xyz/anchor', () => ({
    AnchorProvider: AnchorProviderCtor,
    Program: Object.assign(ProgramCtor, { fetchIdl }),
}));

const anchor: {
    connection: { rpcEndpoint: string };
    programId: { toBase58: () => string } | null;
    signingWallet: { publicKey: { toBase58: () => string } } | null;
} = {
    connection: { rpcEndpoint: 'http://localhost:8899' },
    programId: { toBase58: () => 'PROG' },
    signingWallet: { publicKey: { toBase58: () => 'WALLET' } },
};
vi.mock('../../src/contexts/SolanaAnchorContext', () => ({ useSolanaAnchor: () => anchor }));

import { useProgram } from '../../src/hooks/chains/solana/useProgram';

const wrapper = ({ children }: { children: React.ReactNode }) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

beforeEach(() => {
    vi.clearAllMocks();
    anchor.programId = { toBase58: () => 'PROG' };
    anchor.signingWallet = { publicKey: { toBase58: () => 'WALLET' } };
});

describe('useProgram', () => {
    it('is unconfigured and idle without a program id', async () => {
        anchor.programId = null;
        const { result } = renderHook(() => useProgram(), { wrapper });

        expect(result.current.isConfigured).toBe(false);
        expect(result.current.program).toBeNull();
        expect(result.current.isReady).toBe(false);
        expect(fetchIdl).not.toHaveBeenCalled();
        expect(typeof result.current.toU32).toBe('function');
    });

    it('loads the program once the IDL is fetched', async () => {
        fetchIdl.mockResolvedValue({ name: 'cryptopets' });
        const { result } = renderHook(() => useProgram(), { wrapper });

        await waitFor(() => expect(result.current.isReady).toBe(true));
        expect(result.current.program).toBeTruthy();
        expect(ProgramCtor).toHaveBeenCalledWith({ name: 'cryptopets' }, expect.anything());
        expect(result.current.provider).not.toBeNull();
    });

    it('errors when no IDL is published on-chain', async () => {
        fetchIdl.mockResolvedValue(null);
        const { result } = renderHook(() => useProgram(), { wrapper });

        await waitFor(() => expect(result.current.error).toBeTruthy());
        expect(result.current.program).toBeNull();
    });

    it('exposes a null provider on read-only (no signing wallet)', () => {
        anchor.signingWallet = null;
        const { result } = renderHook(() => useProgram(), { wrapper });
        expect(result.current.provider).toBeNull();
    });
});
