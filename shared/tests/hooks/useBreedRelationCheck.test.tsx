// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const readContracts = { data: undefined as unknown };
vi.mock('wagmi', () => ({
    useReadContracts: (args: { query: { enabled: boolean } }) => (args.query.enabled ? readContracts : { data: undefined }),
}));

const config: { evm: unknown } = { evm: { petCore: { address: '0xpetcore', abi: [] }, chainId: 1 } };
vi.mock('../../src/contexts/PetsConfigContext', () => ({ usePetsConfig: () => config }));

import { useBreedRelationCheck } from '../../src/hooks/chains/ethereum/useBreedRelationCheck';

function breedInfo(parent1: bigint, parent2: bigint) {
    return { status: 'success' as const, result: [0, 0, parent1, parent2] as const };
}

beforeEach(() => {
    vi.clearAllMocks();
    readContracts.data = undefined;
    config.evm = { petCore: { address: '0xpetcore', abi: [] }, chainId: 1 };
});

describe('useBreedRelationCheck', () => {
    it('is not related when neither pet appears as the other\'s parent or shares one', () => {
        readContracts.data = [breedInfo(0n, 0n), breedInfo(0n, 0n)];
        const { result } = renderHook(() => useBreedRelationCheck('1', '2'));
        expect(result.current.areRelated).toBe(false);
    });

    it('flags a parent-child relationship', () => {
        // pet 2's parent1 is pet 1.
        readContracts.data = [breedInfo(0n, 0n), breedInfo(1n, 0n)];
        const { result } = renderHook(() => useBreedRelationCheck('1', '2'));
        expect(result.current.areRelated).toBe(true);
    });

    it('flags siblings sharing a non-zero parent', () => {
        readContracts.data = [breedInfo(9n, 0n), breedInfo(9n, 0n)];
        const { result } = renderHook(() => useBreedRelationCheck('1', '2'));
        expect(result.current.areRelated).toBe(true);
    });

    it('does not treat a shared zero parent as a relation (0 means "no parent")', () => {
        readContracts.data = [breedInfo(0n, 0n), breedInfo(0n, 0n)];
        const { result } = renderHook(() => useBreedRelationCheck('1', '2'));
        expect(result.current.areRelated).toBe(false);
    });

    it('is false while either pet id is empty (nothing selected yet)', () => {
        const { result } = renderHook(() => useBreedRelationCheck('', '2'));
        expect(result.current.areRelated).toBe(false);
    });

    it('is inert (never related) without an EVM config', () => {
        config.evm = undefined;
        readContracts.data = [breedInfo(1n, 0n), breedInfo(1n, 0n)];
        const { result } = renderHook(() => useBreedRelationCheck('1', '2'));
        expect(result.current.areRelated).toBe(false);
    });

    it('is false when either read failed', () => {
        readContracts.data = [{ status: 'failure' }, breedInfo(1n, 0n)];
        const { result } = renderHook(() => useBreedRelationCheck('1', '2'));
        expect(result.current.areRelated).toBe(false);
    });
});
