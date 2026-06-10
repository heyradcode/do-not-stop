import { useChainAdapter } from './adapters/useChainAdapter';
import type { Pet } from '../types/pet';

export interface PetListResult {
    pets: Pet[];
    isLoading: boolean;
    error: Error | null;
    refetch: () => void;
}

export const usePetList = (): PetListResult  => {
    const { pets } = useChainAdapter();
    return {
        pets: pets.data,
        isLoading: pets.isLoading,
        error: pets.error,
        refetch: pets.refetch,
    };
}
