/**
 * The batch `marriageOf` read that replaced a per-card `useMarriageInfo`.
 *
 * Driven through a probe rather than through `MarriageScreen`, because the thing worth
 * pinning is how a multicall's result array maps back onto the roster it was built from, and
 * a screen between the two only hides that.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import type { Pet } from '@shared/core';

const mockState = {
    /** One entry per pet, in roster order, as `useReadContracts` returns them. */
    results: undefined as { status: string; result?: readonly [bigint, string] }[] | undefined,
    isLoading: false,
    hasConfig: true,
};

const mockReadContracts = jest.fn();

jest.mock('wagmi', () => ({
    useReadContracts: (args: unknown) => {
        mockReadContracts(args);
        return { data: mockState.results, isLoading: mockState.isLoading };
    },
}));

jest.mock('@shared/core', () => ({
    usePetsConfig: () => ({
        evm: mockState.hasConfig
            ? { petCore: { address: '0xpetcore', abi: [] }, chainId: 84532 }
            : undefined,
    }),
}));

import { useMarriedPets, type MarriedPet } from '../src/hooks/marriage/useMarriedPets';

const pet = (id: string, over: Partial<Pet> = {}): Pet => ({
    id,
    chain: 'evm',
    name: `Pet ${id}`,
    dna: 0n,
    level: 1,
    rarity: 1,
    winCount: 0,
    lossCount: 0,
    readyAt: 0,
    ...over,
});

const married = (spouseId: bigint) => ({
    status: 'success',
    result: [spouseId, '0xowner'] as const,
});
const single = married(0n);
const failed = { status: 'failure' as const };

/** Renders the hook and hands back what it returned. */
const run = async (chain: 'evm' | 'solana' | null, pets: Pet[]) => {
    let seen!: { marriedPets: MarriedPet[]; isLoading: boolean };
    const Probe = () => {
        seen = useMarriedPets(chain, pets);
        return null;
    };
    await ReactTestRenderer.act(async () => {
        ReactTestRenderer.create(<Probe />);
    });
    return seen;
};

beforeEach(() => {
    mockState.results = undefined;
    mockState.isLoading = false;
    mockState.hasConfig = true;
    jest.clearAllMocks();
});

describe('useMarriedPets on EVM', () => {
    it('keeps the pets with a spouse and drops the rest', async () => {
        mockState.results = [married(7n), single];
        const { marriedPets } = await run('evm', [pet('1'), pet('2')]);

        expect(marriedPets).toEqual([{ pet: pet('1'), spouseId: '7' }]);
    });

    it('pairs each result with the pet it was read for', async () => {
        // The multicall answers positionally. Mapping over the successes alone, or over the
        // married ones alone, shifts every later pet onto someone else's spouse — a card
        // naming the wrong pet, with nothing in the UI to say so.
        //
        // Both kinds of gap are in here on purpose: a single pet at index 0 and a failed
        // read at index 1. A fixture with only one of the two proves only half of it.
        mockState.results = [single, failed, married(7n), married(8n)];
        const { marriedPets } = await run('evm', [pet('1'), pet('2'), pet('3'), pet('4')]);

        expect(marriedPets).toEqual([
            { pet: pet('3'), spouseId: '7' },
            { pet: pet('4'), spouseId: '8' },
        ]);
    });

    it('loses one unreadable pet rather than the whole list', async () => {
        mockState.results = [failed, married(7n)];
        const { marriedPets } = await run('evm', [pet('1'), pet('2')]);

        expect(marriedPets).toEqual([{ pet: pet('2'), spouseId: '7' }]);
    });

    it('asks for marriageOf once per pet, not three reads per card', async () => {
        // `useMarriageInfo` read marriageOf, marriageProposal and marriageCooldownUntil for
        // every pet and the card used the first of the three. Twenty pets was sixty reads.
        await run('evm', [pet('1'), pet('2'), pet('3')]);

        const { contracts } = mockReadContracts.mock.calls[0][0];
        expect(contracts).toHaveLength(3);
        expect(
            contracts.every((c: { functionName: string }) => c.functionName === 'marriageOf'),
        ).toBe(true);
    });

    it('reports loading rather than an empty roster while the read is out', async () => {
        mockState.isLoading = true;
        const { marriedPets, isLoading } = await run('evm', [pet('1')]);

        expect(isLoading).toBe(true);
        expect(marriedPets).toEqual([]);
    });
});

describe('useMarriedPets on Solana', () => {
    it('reads the spouse off the pet, without a contract call', async () => {
        // The pet account carries it, and `usePetList` has already fetched that.
        const { marriedPets, isLoading } = await run('solana', [
            pet('1', { chain: 'solana', spouseId: 9 }),
            pet('2', { chain: 'solana' }),
        ]);

        expect(marriedPets).toEqual([
            { pet: pet('1', { chain: 'solana', spouseId: 9 }), spouseId: '9' },
        ]);
        expect(isLoading).toBe(false);
    });

    it('treats spouse 0 as single, not as married to pet zero', async () => {
        const { marriedPets } = await run('solana', [pet('1', { chain: 'solana', spouseId: 0 })]);
        expect(marriedPets).toEqual([]);
    });
});

describe('useMarriedPets with no chain', () => {
    it('reports nothing rather than reading', async () => {
        const { marriedPets, isLoading } = await run(null, [pet('1')]);
        expect(marriedPets).toEqual([]);
        expect(isLoading).toBe(false);
    });
});
