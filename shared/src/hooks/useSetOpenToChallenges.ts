import { useCallback } from 'react';
import { useChainCapabilities } from './useChainCapabilities';
import { usePetActions } from './chains/solana/usePetActions';
import { usePetList } from './usePetList';

export interface UseSetOpenToChallengesResult {
    /** Toggle the pet's open-to-challenges flag. No-op on EVM. */
    toggle(petId: string, currentValue: boolean): Promise<void>;
    isPending: boolean;
    error: Error | null;
}

/**
 * Wraps the Solana `setOpenToChallenges` program instruction.
 * Looks up the pet's asset key from the local pet list. No-op on EVM —
 * EVM has no defender consent; all pets are challengeable by default.
 */
export const useSetOpenToChallenges = (): UseSetOpenToChallengesResult => {
    const { activeKind } = useChainCapabilities();
    const actions = usePetActions();
    const { pets } = usePetList();

    const toggle = useCallback(async (petId: string, currentValue: boolean) => {
        if (activeKind !== 'solana') return;
        const pet = pets.find((p) => p.id === petId);
        if (!pet?.assetKey) throw new Error(`Asset key not found for pet #${petId} — refresh and retry`);
        await actions.setOpenToChallenges.mutateAsync({
            petId: Number(petId),
            assetKey: pet.assetKey,
            value: !currentValue,
        });
    }, [activeKind, pets, actions.setOpenToChallenges]);

    return {
        toggle,
        isPending: actions.setOpenToChallenges.isPending,
        error: actions.setOpenToChallenges.error as Error | null,
    };
};
