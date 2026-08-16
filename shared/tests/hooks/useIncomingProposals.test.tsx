// @vitest-environment jsdom
/**
 * The failure this file exists for is a silent one: the EVM multicall runs with
 * `allowFailure: true`, and a failed entry was skipped, which looks exactly like a pet
 * nobody proposed to. An RPC hiccup therefore rendered as an empty inbox with no error
 * anywhere, on the one screen whose job is to say something is waiting.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const ZERO = '0x0000000000000000000000000000000000000000';

type Entry = { status: 'success'; result: readonly [bigint, string, bigint] } | { status: 'failure' };

const state = {
    /** One entry per pet in `pets`, in the same order — that pairing is what the hook assumes. */
    results: undefined as Entry[] | undefined,
    pets: [] as { id: string; name: string }[],
};

vi.mock('wagmi', () => ({
    useReadContracts: () => ({
        data: state.results,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
    }),
}));

vi.mock('../../src/hooks/pets/useAllPets', () => ({
    useAllPets: () => ({ pets: state.pets, isLoading: false, error: null, refetch: vi.fn() }),
}));

// Solana is never reached by these cases, but the module graph still loads it.
vi.mock('../../src/hooks/chains/solana/useProgram', () => ({
    useProgram: () => ({ programId: null, program: null, isReady: false }),
}));

const config: { evm: unknown } = {
    evm: { petCore: { address: '0xcore', abi: [] }, chainId: 84532 },
};
vi.mock('../../src/contexts/PetsConfigContext', () => ({ usePetsConfig: () => config }));

import { useIncomingProposals } from '../../src/hooks/marriage/useIncomingProposals';

const future = BigInt(Math.floor(Date.now() / 1000) + 10_000);
const past = BigInt(Math.floor(Date.now() / 1000) - 10_000);

/*
 * Both chain branches are hooks, so both run on every render regardless of which one the
 * caller asked for. The Solana half calls `useQuery`, which needs a client even when its
 * `enabled` is false and it never fetches.
 */
const wrapper = ({ children }: { children: React.ReactNode }) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

const proposalTo = (petIdB: bigint, expiry = future): Entry => ({
    status: 'success',
    result: [petIdB, '0xproposerOwner', expiry],
});
const noProposal = (): Entry => ({ status: 'success', result: [0n, ZERO, 0n] });

beforeEach(() => {
    state.results = undefined;
    state.pets = [
        { id: '10', name: 'TAZAN' },
        { id: '12', name: 'zergling' },
        { id: '16', name: 'TOM' },
    ];
    config.evm = { petCore: { address: '0xcore', abi: [] }, chainId: 84532 };
});

describe('useIncomingProposals', () => {
    it('finds a live proposal aimed at one of my pets', () => {
        state.results = [proposalTo(17n), noProposal(), noProposal()];
        const { result } = renderHook(() => useIncomingProposals('evm', ['17']), { wrapper });

        expect(result.current.proposals).toHaveLength(1);
        expect(result.current.proposals[0]).toMatchObject({
            proposerPetId: '10',
            proposerPetName: 'TAZAN',
            targetPetId: '17',
        });
    });

    it('ignores a proposal aimed at somebody else', () => {
        state.results = [proposalTo(99n), noProposal(), noProposal()];
        const { result } = renderHook(() => useIncomingProposals('evm', ['17']), { wrapper });
        expect(result.current.proposals).toHaveLength(0);
    });

    /*
     * `proposalTTL` was 60 seconds on the live deployment for a while, so this is not a
     * far-fetched case: a proposal read one poll after it was sent can already be dead.
     */
    it('ignores an expired proposal', () => {
        state.results = [proposalTo(17n, past), noProposal(), noProposal()];
        const { result } = renderHook(() => useIncomingProposals('evm', ['17']), { wrapper });
        expect(result.current.proposals).toHaveLength(0);
    });

    describe('when some reads fail', () => {
        it('counts them instead of reporting an empty inbox', () => {
            state.results = [{ status: 'failure' }, { status: 'failure' }, noProposal()];
            const { result } = renderHook(() => useIncomingProposals('evm', ['17']), { wrapper });

            expect(result.current.proposals).toHaveLength(0);
            expect(result.current.unreadable).toBe(2);
        });

        it('still returns the proposals it could read', () => {
            // The point of `allowFailure`: one bad entry must not cost the whole list.
            state.results = [proposalTo(17n), { status: 'failure' }, noProposal()];
            const { result } = renderHook(() => useIncomingProposals('evm', ['17']), { wrapper });

            expect(result.current.proposals).toHaveLength(1);
            expect(result.current.unreadable).toBe(1);
        });

        it('reports nothing unreadable when every read landed', () => {
            state.results = [proposalTo(17n), noProposal(), noProposal()];
            const { result } = renderHook(() => useIncomingProposals('evm', ['17']), { wrapper });
            expect(result.current.unreadable).toBe(0);
        });
    });

    it('reports nothing unreadable before the first read resolves', () => {
        state.results = undefined;
        const { result } = renderHook(() => useIncomingProposals('evm', ['17']), { wrapper });
        expect(result.current.unreadable).toBe(0);
        expect(result.current.proposals).toHaveLength(0);
    });

    it('answers empty on a chain it does not handle', () => {
        const { result } = renderHook(() => useIncomingProposals(null, ['17']), { wrapper });
        expect(result.current.proposals).toHaveLength(0);
        expect(result.current.unreadable).toBe(0);
    });
});
