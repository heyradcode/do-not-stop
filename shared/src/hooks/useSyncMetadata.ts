import { useCallback } from 'react';
import { useChainCapabilities } from './useChainCapabilities';
import { usePetActions } from './chains/solana/usePetActions';
import { usePetList } from './usePetList';

export interface UseSyncMetadataResult {
    /**
     * Re-publishes the pet's on-chain state to its Metaplex Core NFT attributes.
     * No-op on EVM (NFT metadata is handled differently). Permissionless on Solana.
     */
    sync(petId: string): Promise<void>;
    isPending: boolean;
    error: Error | null;
}

/**
 * Wraps the Solana `syncMetadata` program instruction.
 * Useful after level_up or battle wins where the pet's attributes change on-chain
 * but the NFT metadata hasn't been updated yet.
 */
export const useSyncMetadata = (): UseSyncMetadataResult => {
    const { activeKind } = useChainCapabilities();
    const actions = usePetActions();
    const { pets } = usePetList();

    const sync = useCallback(async (petId: string) => {
        if (activeKind !== 'solana') return;
        const pet = pets.find((p) => p.id === petId);
        if (!pet?.assetKey) throw new Error(`Asset key not found for pet #${petId} — refresh and retry`);
        await actions.syncMetadata.mutateAsync({ assetKey: pet.assetKey });
    }, [activeKind, pets, actions.syncMetadata]);

    return {
        sync,
        isPending: actions.syncMetadata.isPending,
        error: actions.syncMetadata.error as Error | null,
    };
};
