import { useMemo } from 'react';
import { useReadContracts } from 'wagmi';
import { usePetsConfig } from '../../../contexts/PetsConfigContext';

export interface BreedRelationCheck {
    /** True when the two pets are parent/child or share a parent (siblings) — the
     *  contract rejects breeding these. False (never blocking) on a non-EVM chain. */
    areRelated: boolean;
}

/**
 * Reads `getBreedInfo` for both candidate parents and flags a parent-child or
 * sibling relationship before submission, so the UI can disable "Breed" instead
 * of letting the contract revert. EVM-only — inert (always `areRelated: false`)
 * without an EVM config, so it's safe to call unconditionally from a chain-blind
 * panel (same pattern as usePendingBreed).
 */
export const useBreedRelationCheck = (petIdA: string, petIdB: string): BreedRelationCheck => {
    const { evm } = usePetsConfig();
    const petCoreAddress = evm?.petCore.address as `0x${string}` | undefined;
    const petCoreAbi = useMemo(() => evm?.petCore.abi ?? [], [evm?.petCore.abi]);
    const enabled = Boolean(petCoreAddress && petIdA && petIdB);

    const { data } = useReadContracts({
        contracts: enabled
            ? [
                  {
                      address: petCoreAddress!,
                      abi: petCoreAbi,
                      functionName: 'getBreedInfo' as const,
                      args: [BigInt(petIdA)] as const,
                      chainId: evm?.chainId,
                  },
                  {
                      address: petCoreAddress!,
                      abi: petCoreAbi,
                      functionName: 'getBreedInfo' as const,
                      args: [BigInt(petIdB)] as const,
                      chainId: evm?.chainId,
                  },
              ]
            : [],
        allowFailure: true,
        query: { enabled, staleTime: 60_000 },
    });

    const areRelated = useMemo(() => {
        if (!enabled || !data) return false;
        const r1 = data[0];
        const r2 = data[1];
        if (!r1 || !r2 || r1.status !== 'success' || r2.status !== 'success') return false;
        const [, , p1a, p1b] = r1.result as readonly [number, number, bigint, bigint];
        const [, , p2a, p2b] = r2.result as readonly [number, number, bigint, bigint];
        const id1 = BigInt(petIdA);
        const id2 = BigInt(petIdB);
        // Parent-child
        if (id1 === p2a || id1 === p2b) return true;
        if (id2 === p1a || id2 === p1b) return true;
        // Siblings (share a non-zero parent)
        if (p1a !== 0n && (p1a === p2a || p1a === p2b)) return true;
        if (p1b !== 0n && (p1b === p2a || p1b === p2b)) return true;
        return false;
    }, [enabled, data, petIdA, petIdB]);

    return { areRelated };
};
