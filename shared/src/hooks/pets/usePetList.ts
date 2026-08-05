import { useChainAdapter } from '../adapters/useChainAdapter';
import { useActiveChain } from '../session/useActiveChain';
import { useBattleProgress } from '../battle/useBattleProgress';
import type { Pet } from '../../types/pet';

export interface PetListResult {
    pets: Pet[];
    isLoading: boolean;
    error: Error | null;
    refetch: () => void;
}

/**
 * The player's own pets, as the UI should show them.
 *
 * The adapter returns chain truth. Battles stopped settling on chain (§L Phase 6), so
 * level, XP and win/loss come from the backend's progression record instead — see
 * {@link useBattleProgress}. This is the single seam where the two are combined, so every
 * surface listing a player's pets shows the same numbers as the opponent list, which the
 * backend already merges server-side.
 */
export const usePetList = (): PetListResult => {
    const { pets } = useChainAdapter();
    const chain = useActiveChain();
    const merged = useBattleProgress(chain.kind === 'none' ? null : chain.kind, pets.data);

    return {
        pets: merged,
        isLoading: pets.isLoading,
        error: pets.error,
        refetch: pets.refetch,
    };
};
