import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '../../contexts/ApiClientContext';
import type { PetChain } from '../../types/pet';
import { battleProgressQueryPrefix } from '../battle/useBattleProgress';
import { inventoryQueryKey } from './useInventory';

/**
 * Spending a consumable on a pet (roadmap §4).
 *
 * A REST call rather than a chain write, unlike equipping: the backend burns the item from
 * its own authorized wallet after applying the effect, so the player signs nothing. That is
 * the whole reason a consumable is one click and an equip is a wallet prompt.
 */

export interface SpendItemArgs {
    chain: PetChain;
    /** Pet id as a decimal string. */
    petId: string;
    /** ERC-1155 token id as a decimal string. */
    itemType: string;
}

/** What the server reports back: the burn, and the pet's progression after the effect. */
export interface SpendItemResult {
    burnTxHash: string;
    level: number;
    xp: number;
    /** Unix seconds the pet is next battle-ready, per the backend cooldown. */
    readyAt: number;
    leveledUp: boolean;
}

export interface UseSpendItemResult {
    /**
     * Named `spend` rather than `useItem`: a returned function whose name starts with
     * `use` reads as a hook, and eslint's rules-of-hooks rejects calling one from an event
     * handler, which is the only place this is ever called from.
     */
    spend(args: SpendItemArgs): Promise<SpendItemResult>;
    isPending: boolean;
    error: Error | null;
    reset(): void;
}

export const useSpendItem = (): UseSpendItemResult => {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    const baseURL = apiClient.defaults.baseURL ?? '';

    const mutation = useMutation({
        mutationFn: async (args: SpendItemArgs) => {
            const { data } = await apiClient.post<SpendItemResult>('/api/inventory/use', args);
            return data;
        },
        // Invalidated rather than patched, and never optimistically. The burn is a
        // transaction: until the server says it landed, the item is still the player's, and
        // a bag that already showed it gone would be lying about a spend that could fail.
        //
        // Both things a consumable moves are refreshed here, not just the bag. Every effect
        // this route accepts writes `pet_battle_progress`: `grant_xp` changes level and xp,
        // `clear_battle_cooldown` changes readyAt. Leaving that to the caller was the
        // arrangement before, and neither call site did it, so a cooldown tonic consumed the
        // item and left the pet still showing as resting, the item reading as broken rather
        // than as applied. A mutation that knows what it changed should invalidate it; a
        // hook the caller has to remember to pair with is a bug waiting for its second
        // caller.
        onSuccess: (_result, args) => {
            void queryClient.invalidateQueries({ queryKey: inventoryQueryKey(baseURL, args.chain) });
            void queryClient.invalidateQueries({ queryKey: battleProgressQueryPrefix(baseURL, args.chain) });
        },
    });

    return {
        spend: mutation.mutateAsync,
        isPending: mutation.isPending,
        error: mutation.error as Error | null,
        reset: mutation.reset,
    };
};
