import { useMemo } from 'react';
import type { Pet } from '../types/pet';
import { usePetsContract } from './chains/ethereum/usePetsContract';
import { usePets as useSolanaPets } from './chains/solana/usePets';
import { useSolanaAnchor } from '../contexts/SolanaAnchorContext';
import { usePetsConfig } from '../contexts/PetsConfigContext';
import { mapEvmPet, type EvmRawPet } from '../utils/pets/mapEvmPet';
import { mapSolanaPet, type SolanaPetAccountRow } from '../utils/pets/mapSolanaPet';
import { useActiveChain } from './useActiveChain';

export interface PetListResult {
    pets: Pet[];
    isLoading: boolean;
    error: Error | null;
    refetch: () => void;
}

export function usePetList(): PetListResult {
    const chain = useActiveChain();
    const { evm } = usePetsConfig();
    const { signingWallet } = useSolanaAnchor();
    const isEvm = chain.kind === 'evm';
    const isSolana = chain.kind === 'solana';

    const evmEnabled = isEvm && Boolean(evm?.contractAddress);
    const solanaOwner = isSolana ? signingWallet?.publicKey ?? null : null;

    const evmResult = usePetsContract({
        contractAddress: evm?.contractAddress,
        abi: evm?.abi ?? [],
        enabled: evmEnabled,
    });

    const solanaQuery = useSolanaPets(solanaOwner);

    const evmPets = useMemo<Pet[]>(() => {
        if (!isEvm) return [];
        const raws = evmResult.pets as unknown as EvmRawPet[];
        const ids = evmResult.petIds;
        return raws.map((raw, i) => mapEvmPet(raw, ids[i] ?? BigInt(i)));
    }, [isEvm, evmResult.pets, evmResult.petIds]);

    const solanaPets = useMemo<Pet[]>(() => {
        if (!isSolana) return [];
        const rows = (solanaQuery.data ?? []) as SolanaPetAccountRow[];
        return rows.map(mapSolanaPet);
    }, [isSolana, solanaQuery.data]);

    if (isEvm) {
        return {
            pets: evmPets,
            isLoading: evmResult.isLoading,
            error: (evmResult.contractError as Error | undefined) ?? null,
            refetch: () => {
                evmResult.refetchPetIds();
                void evmResult.refetchPetsData();
            },
        };
    }

    if (isSolana) {
        return {
            pets: solanaPets,
            isLoading: solanaQuery.isLoading || solanaQuery.isFetching,
            error: (solanaQuery.error as Error | null) ?? null,
            refetch: () => {
                void solanaQuery.refetch();
            },
        };
    }

    return {
        pets: [],
        isLoading: false,
        error: null,
        refetch: () => undefined,
    };
}
