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
