import React from 'react';
import { useChainCapabilities, useSyncMetadata } from '@shared/core';
import { useTxErrorToast } from '@hooks/useTxErrorToast';

type SyncMetadataButtonProps = {
    /** Pet to sync; nothing renders on EVM or when petId is absent. */
    petId?: string;
};

/**
 * Re-syncs a Solana pet's Metaplex Core NFT attributes from on-chain state.
 * Most useful after level-up or battle wins where level/XP changed.
 * Permissionless — the connected wallet just pays the tx fee.
 */
const SyncMetadataButton: React.FC<SyncMetadataButtonProps> = ({ petId }) => {
    const { activeKind } = useChainCapabilities();
    const { sync, isPending, error } = useSyncMetadata();
    useTxErrorToast(error);

    if (activeKind !== 'solana' || !petId) return null;

    return (
        <button
            type="button"
            className="sync-metadata-button"
            disabled={isPending}
            onClick={() => void sync(petId)}
        >
            {isPending ? 'Syncing NFT…' : 'Sync NFT metadata'}
        </button>
    );
};

export default SyncMetadataButton;
