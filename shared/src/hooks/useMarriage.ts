import { useCallback } from 'react';
import { useChainCapabilities } from './useChainCapabilities';
import { useMarriage as useEvmMarriage, type MarriageAction } from './chains/ethereum/useMarriage';
import { useSolanaMarriage } from './chains/solana/useSolanaMarriage';
import { usePetList } from './usePetList';

export type { MarriageAction };

const IDLE_ACTION = <TArgs,>(): MarriageAction<TArgs> => ({
    mutateAsync: async () => { throw new Error('No chain connected'); },
    isPending: false,
    error: null,
    reset: () => undefined,
});

/**
 * Chain-aware marriage write actions.
 * EVM: delegates to PetCore contract (proposeMarriage / acceptMarriage / cancelProposal / divorce).
 * Solana: delegates to the Anchor program's marriage instructions, resolving asset PDAs internally.
 */
export const useMarriage = () => {
    const { kind } = useChainCapabilities();
    const evm = useEvmMarriage();
    const solana = useSolanaMarriage();
    const { pets } = usePetList();

    const findAsset = useCallback((petId: string): string => {
        const pet = pets.find((p) => p.id === petId);
        if (!pet?.assetKey) throw new Error(`Asset key not found for pet #${petId} — refresh and retry`);
        return pet.assetKey;
    }, [pets]);

    const findSpouseId = useCallback((petId: string): number => {
        const pet = pets.find((p) => p.id === petId);
        if (!pet?.spouseId) throw new Error(`Pet #${petId} is not married`);
        return pet.spouseId;
    }, [pets]);

    if (kind === 'solana') {
        const propose: MarriageAction<{ petIdA: string; petIdB: string }> = {
            async mutateAsync({ petIdA, petIdB }) {
                const assetKeyA = findAsset(petIdA);
                await solana.propose.mutateAsync({ petIdA, petIdB, assetKeyA });
            },
            get isPending() { return solana.propose.isPending; },
            get error() { return solana.propose.error; },
            reset: solana.propose.reset,
        };

        const accept: MarriageAction<{ petIdA: string; petIdB: string }> = {
            async mutateAsync({ petIdA, petIdB }) {
                const assetKeyB = findAsset(petIdB);
                await solana.accept.mutateAsync({ petIdA, petIdB, assetKeyB });
            },
            get isPending() { return solana.accept.isPending; },
            get error() { return solana.accept.error; },
            reset: solana.accept.reset,
        };

        const cancel: MarriageAction<{ petIdA: string }> = {
            async mutateAsync({ petIdA }) {
                await solana.cancel.mutateAsync({ petIdA });
            },
            get isPending() { return solana.cancel.isPending; },
            get error() { return solana.cancel.error; },
            reset: solana.cancel.reset,
        };

        const divorce: MarriageAction<{ petId: string }> = {
            async mutateAsync({ petId }) {
                const assetKey = findAsset(petId);
                const spouseId = findSpouseId(petId);
                await solana.divorce.mutateAsync({ petId, assetKey, spouseId });
            },
            get isPending() { return solana.divorce.isPending; },
            get error() { return solana.divorce.error; },
            reset: solana.divorce.reset,
        };

        const resetAll = () => {
            solana.propose.reset();
            solana.accept.reset();
            solana.cancel.reset();
            solana.divorce.reset();
        };

        return { propose, accept, cancel, divorce, canWrite: solana.canWrite, resetAll };
    }

    if (kind === 'evm') {
        return evm;
    }

    return {
        propose: IDLE_ACTION<{ petIdA: string; petIdB: string }>(),
        accept: IDLE_ACTION<{ petIdA: string; petIdB: string }>(),
        cancel: IDLE_ACTION<{ petIdA: string }>(),
        divorce: IDLE_ACTION<{ petId: string }>(),
        canWrite: false,
        resetAll: () => undefined,
    };
};
