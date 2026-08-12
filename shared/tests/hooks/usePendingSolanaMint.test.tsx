// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Keypair, PublicKey } from '@solana/web3.js';
import React from 'react';

/**
 * The mint half of the stuck-VRF escape hatch. Mirrors `usePendingSolanaBreed`'s suite,
 * plus the two things that are specific to mint being the *only* way out: the accounts
 * `cancel_mint` is actually sent, and the exact expiry boundary.
 */

const owner = Keypair.generate().publicKey;
const programId = Keypair.generate().publicKey;

const fetchNullable = vi.fn();
const cancelMintRpc = vi.fn().mockResolvedValue('cancel-sig');
const cancelMintAccounts = vi.fn(() => ({ rpc: cancelMintRpc }));
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
            cancelMint: () => ({ accounts: cancelMintAccounts }),
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

// findProgramAddressSync is avoided in jsdom (crypto compat), matching the breed suite.
const stubPda = (name: string) => [{ toBase58: () => `${name}11111111111111111` }, 255] as const;
vi.mock('../../src/utils/solana/pdas', () => ({
    mintRequestPda: () => stubPda('MintReq'),
    globalStatePda: () => stubPda('GlobalState'),
}));

import { usePendingSolanaMint } from '../../src/hooks/chains/solana/usePendingSolanaMint';

function wrapper({ children }: { children: React.ReactNode }) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return React.createElement(QueryClientProvider, { client: qc }, children);
}

/** A pending request at `commitSlot`, with the global state's expiry window. */
function pendingRequest(commitSlot: number, expirySlots: number) {
    fetchNullable
        .mockResolvedValueOnce({ commitSlot, petId: 7, owner })
        .mockResolvedValue({ randomnessExpirySlots: expirySlots });
}

beforeEach(() => {
    vi.clearAllMocks();
    programStub.isReady = true;
    programStub.programId = programId;
    fetchNullable.mockResolvedValue(null);
    getSlot.mockResolvedValue(1000);
    cancelMintRpc.mockResolvedValue('cancel-sig');
    cancelMintAccounts.mockImplementation(() => ({ rpc: cancelMintRpc }));
});

describe('usePendingSolanaMint', () => {
    it('query is disabled when enabled=false', () => {
        const { result } = renderHook(() => usePendingSolanaMint(false), { wrapper });
        expect(result.current.isPending).toBe(false);
        expect(fetchNullable).not.toHaveBeenCalled();
    });

    it('query is disabled when program is not ready', () => {
        programStub.isReady = false;
        const { result } = renderHook(() => usePendingSolanaMint(true), { wrapper });
        expect(result.current.isPending).toBe(false);
        expect(fetchNullable).not.toHaveBeenCalled();
    });

    it('isPending=false when the mintRequest PDA is empty', async () => {
        fetchNullable.mockResolvedValue(null);
        const { result } = renderHook(() => usePendingSolanaMint(), { wrapper });
        await waitFor(() => expect(result.current.isPending).toBe(false));
        expect(result.current.canCancel).toBe(false);
    });

    it('isPending=true when a mintRequest exists', async () => {
        pendingRequest(900, 50);
        const { result } = renderHook(() => usePendingSolanaMint(), { wrapper });
        await waitFor(() => expect(result.current.isPending).toBe(true));
    });

    it('canCancel=false while the randomness is still live', async () => {
        // commitSlot 900 + expiry 200 = 1100, and the chain is at 1000.
        pendingRequest(900, 200);
        const { result } = renderHook(() => usePendingSolanaMint(), { wrapper });
        await waitFor(() => expect(result.current.isPending).toBe(true));
        expect(result.current.canCancel).toBe(false);
    });

    it('canCancel=true once the randomness has expired', async () => {
        pendingRequest(900, 50);
        const { result } = renderHook(() => usePendingSolanaMint(), { wrapper });
        await waitFor(() => expect(result.current.canCancel).toBe(true));
    });

    // The program requires `clock.slot > commit_slot + expiry`, so offering the button
    // one slot early produces a transaction that fails as not-yet-expired.
    it('is still false on the expiry slot itself', async () => {
        pendingRequest(900, 100); // expires at 1000, and the chain is at 1000.
        const { result } = renderHook(() => usePendingSolanaMint(), { wrapper });
        await waitFor(() => expect(result.current.isPending).toBe(true));
        expect(result.current.canCancel).toBe(false);
    });

    // `cancel_mint` takes global_state, owner and mint_request, and closes the request to
    // the owner. Sending the wrong owner would refund someone else's rent, so the account
    // set is worth pinning rather than assumed.
    it('sends cancel_mint with the request, its global state and the owner', async () => {
        pendingRequest(900, 50);
        const { result } = renderHook(() => usePendingSolanaMint(), { wrapper });
        await waitFor(() => expect(result.current.canCancel).toBe(true));

        await act(async () => {
            await result.current.cancel.run();
        });

        expect(cancelMintRpc).toHaveBeenCalledTimes(1);
        const accounts = cancelMintAccounts.mock.calls[0]?.[0] as unknown as Record<string, { toBase58(): string }>;
        expect(accounts.owner).toBe(owner);
        expect(accounts.mintRequest.toBase58()).toContain('MintReq');
        expect(accounts.globalState.toBase58()).toContain('GlobalState');
    });

    it('cancel.isPending and cancel.error default to false/null', () => {
        const { result } = renderHook(() => usePendingSolanaMint(), { wrapper });
        expect(result.current.cancel.isPending).toBe(false);
        expect(result.current.cancel.error).toBeNull();
    });

    it('exposes a refetch function', () => {
        const { result } = renderHook(() => usePendingSolanaMint(), { wrapper });
        expect(typeof result.current.refetch).toBe('function');
    });
});
