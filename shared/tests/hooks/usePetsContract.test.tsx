// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const account: { address: `0x${string}` | undefined; isConnected: boolean } = {
    address: '0xwallet' as `0x${string}`,
    isConnected: true,
};

const petIds: bigint[] = [];
const petsData: { status: string; result?: unknown }[] = [];

vi.mock('wagmi', () => ({
    useAccount: () => account,
    useReadContract: () => ({ data: petIds, refetch: vi.fn(), error: null }),
    useReadContracts: () => ({ data: petsData, isLoading: false, error: null, refetch: vi.fn() }),
}));

import { usePetsContract } from '../../src/hooks/chains/ethereum/usePetsContract';

const ABI: never[] = [];

beforeEach(() => {
    account.address = '0xwallet' as `0x${string}`;
    account.isConnected = true;
    petIds.length = 0;
    petsData.length = 0;
});

describe('usePetsContract', () => {
    it('returns empty pets list when no data', () => {
        const { result } = renderHook(() =>
            usePetsContract({ contractAddress: '0xcore', abi: ABI }),
        );
        expect(result.current.pets).toEqual([]);
        expect(result.current.petIds).toEqual([]);
    });

    it('isContractConfigured=false when no address', () => {
        const { result } = renderHook(() =>
            usePetsContract({ contractAddress: undefined, abi: ABI }),
        );
        expect(result.current.isContractConfigured).toBe(false);
    });

    it('isContractConfigured=true when address provided', () => {
        const { result } = renderHook(() =>
            usePetsContract({ contractAddress: '0xcore', abi: ABI }),
        );
        expect(result.current.isContractConfigured).toBe(true);
    });

    it('maps raw petsData to Pet objects', () => {
        petIds.push(1n);
        petsData.push({
            status: 'success',
            result: {
                name: 'Rex', dna: 12345n, level: 3, readyTime: 0n,
                winCount: 5, lossCount: 2, rarity: 1,
                xp: 100, generation: 1, breedCount: 0,
            },
        });

        const { result } = renderHook(() =>
            usePetsContract({ contractAddress: '0xcore', abi: ABI }),
        );

        expect(result.current.pets).toHaveLength(1);
        expect(result.current.pets[0]).toMatchObject({
            name: 'Rex',
            dna: 12345n,
            level: 3,
            winCount: 5,
            xp: 100,
            generation: 1,
        });
    });

    it('filters out failed contract reads', () => {
        // One id in, one failed read back: the hook builds the read list from the ids, so
        // the two are always the same length in the real thing.
        petIds.push(1n);
        petsData.push({ status: 'failure' });
        const { result } = renderHook(() =>
            usePetsContract({ contractAddress: '0xcore', abi: ABI }),
        );
        expect(result.current.pets).toHaveLength(0);
    });

    it('exposes wallet address and connection state', () => {
        const { result } = renderHook(() =>
            usePetsContract({ contractAddress: '0xcore', abi: ABI }),
        );
        expect(result.current.address).toBe('0xwallet');
        expect(result.current.isConnected).toBe(true);
    });

    it('omits optional v2 fields when undefined on raw result', () => {
        petIds.push(2n);
        petsData.push({
            status: 'success',
            result: {
                name: 'Blaze', dna: 0n, level: 1, readyTime: 0n,
                winCount: 0, lossCount: 0, rarity: 0,
            },
        });
        const { result } = renderHook(() =>
            usePetsContract({ contractAddress: '0xcore', abi: ABI }),
        );
        expect(result.current.pets[0].xp).toBeUndefined();
        expect(result.current.pets[0].generation).toBeUndefined();
    });
});

/**
 * `pets` and `petIds` are read positionally by `useEvmAdapter`, which zips index i of one
 * against index i of the other. `pets` used to be filtered for successful reads while
 * `petIds` was returned whole, so any failed read slid every later pet onto the previous
 * pet's id.
 *
 * A wallet holding [5, 6, 10, 12] whose last read failed showed three pets and no sign of
 * the fourth, which is how this was found. The same failure in the middle of the list is
 * the dangerous one: it renames pets rather than hiding one, and every action the player
 * takes afterwards is aimed at an id that belongs to a different animal.
 */
const raw = (name: string) => ({
    status: 'success',
    result: {
        name, dna: 1n, level: 1, readyTime: 0n, winCount: 0, lossCount: 0, rarity: 0,
    },
});

describe('pets and petIds stay aligned when a read fails', () => {
    it('keeps every surviving pet on its own id when the failure is last', () => {
        petIds.push(5n, 6n, 10n, 12n);
        petsData.push(raw('TIMON'), raw('PUMBA'), raw('TAZAN'), { status: 'failure' });

        const { result } = renderHook(() =>
            usePetsContract({ contractAddress: '0xcore', abi: ABI }),
        );

        expect(result.current.pets.map((p) => p.name)).toEqual(['TIMON', 'PUMBA', 'TAZAN']);
        expect(result.current.petIds).toEqual([5n, 6n, 10n]);
    });

    it('does not slide later pets onto earlier ids when the failure is in the middle', () => {
        petIds.push(5n, 6n, 10n, 12n);
        petsData.push(raw('TIMON'), { status: 'failure' }, raw('TAZAN'), raw('zergling'));

        const { result } = renderHook(() =>
            usePetsContract({ contractAddress: '0xcore', abi: ABI }),
        );

        expect(result.current.pets.map((p) => p.name)).toEqual(['TIMON', 'TAZAN', 'zergling']);
        // Not [5, 6, 10]: TAZAN is 10 and zergling is 12, whatever failed beside them.
        expect(result.current.petIds).toEqual([5n, 10n, 12n]);
    });

    it('names the pets it could not read instead of dropping them silently', () => {
        petIds.push(5n, 12n);
        petsData.push(raw('TIMON'), { status: 'failure' });

        const { result } = renderHook(() =>
            usePetsContract({ contractAddress: '0xcore', abi: ABI }),
        );

        expect(result.current.contractError?.message).toContain('12');
        expect(result.current.contractError?.message).toContain('still yours');
    });

    it('reports no error while the batch has simply not resolved yet', () => {
        // Ids known, reads still in flight. Every pet is "unreadable" at this moment and
        // none of them is a failure, so claiming otherwise would flash an error on load.
        petIds.push(5n, 12n);

        const { result } = renderHook(() =>
            usePetsContract({ contractAddress: '0xcore', abi: ABI }),
        );

        expect(result.current.contractError).toBeNull();
        expect(result.current.pets).toEqual([]);
    });
});
