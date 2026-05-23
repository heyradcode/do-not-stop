import { useMemo } from 'react';
import type { Pet } from '../../types/pet';
import { usePetsContract } from '../ethereum/usePetsContract';
import { usePets as useSolanaPets } from '../solana/usePets';
import { useSolanaAnchor } from '../../contexts/SolanaAnchorContext';
import { usePetsConfig } from '../../contexts/PetsConfigContext';
import { mapEvmPet, type EvmRawPet } from '../../utils/pets/mapEvmPet';
import { mapSolanaPet, type SolanaPetAccountRow } from '../../utils/pets/mapSolanaPet';
import { useActiveChain } from './useActiveChain';

export interface PetListResult {
    pets: Pet[];
    isLoading: boolean;
    error: Error | null;
    refetch: () => void;
    isSupported: true;
}

export function usePetList(): PetListResult {
    const chain = useActiveChain();
    const { evm } = usePetsConfig();
    const { signingWallet } = useSolanaAnchor();

    const evmEnabled = chain.kind === 'evm' && Boolean(evm?.contractAddress);
    const solanaOwner = chain.kind === 'solana' ? signingWallet?.publicKey ?? null : null;

    const evmResult = usePetsContract({
        contractAddress: evm?.contractAddress,
        abi: evm?.abi ?? [],
        enabled: evmEnabled,
    });

    const solanaQuery = useSolanaPets(solanaOwner);

    const evmPets = useMemo<Pet[]>(() => {
        if (chain.kind !== 'evm') return [];
        const raws = evmResult.pets as unknown as EvmRawPet[];
        const ids = evmResult.petIds;
        return raws.map((raw, i) => mapEvmPet(raw, ids[i] ?? BigInt(i)));
    }, [chain.kind, evmResult.pets, evmResult.petIds]);

    const solanaPets = useMemo<Pet[]>(() => {
        if (chain.kind !== 'solana') return [];
        const rows = (solanaQuery.data ?? []) as SolanaPetAccountRow[];
        return rows.map(mapSolanaPet);
    }, [chain.kind, solanaQuery.data]);

    if (chain.kind === 'evm') {
        return {
            pets: evmPets,
            isLoading: evmResult.isLoading,
            error: (evmResult.contractError as Error | undefined) ?? null,
            refetch: () => {
                evmResult.refetchPetIds();
            },
            isSupported: true,
        };
    }

    if (chain.kind === 'solana') {
        return {
            pets: solanaPets,
            isLoading: solanaQuery.isLoading || solanaQuery.isFetching,
            error: (solanaQuery.error as Error | null) ?? null,
            refetch: () => {
                void solanaQuery.refetch();
            },
            isSupported: true,
        };
    }

    return {
        pets: [],
        isLoading: false,
        error: null,
        refetch: () => undefined,
        isSupported: true,
    };
}
