import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '../../contexts/ApiClientContext';
import type { PetChain } from '../../types/pet';
import { inventoryQueryKey } from './useInventory';

/**
 * Spending a consumable on a pet (roadmap §4).
 *
 * A REST call rather than a chain write, unlike equipping: the backend burns the item from
 * its own authorized wallet after applying the effect, so the player signs nothing. That is
 * the whole reason a consumable is one click and an equip is a wallet prompt.
 */

export interface UseItemArgs {
    chain: PetChain;
    /** Pet id as a decimal string. */
    petId: string;
    /** ERC-1155 token id as a decimal string. */
    itemType: string;
}

/** What the server reports back: the burn, and the pet's progression after the effect. */
export interface UseItemResult {
    burnTxHash: string;
    level: number;
    xp: number;
    /** Unix seconds the pet is next battle-ready, per the backend cooldown. */
    readyAt: number;
    leveledUp: boolean;
}

export interface UseUseItemResult {
    useItem(args: UseItemArgs): Promise<UseItemResult>;
    isPending: boolean;
    error: Error | null;
    reset(): void;
}

export const useUseItem = (): UseUseItemResult => {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    const baseURL = apiClient.defaults.baseURL ?? '';

    const mutation = useMutation({
        mutationFn: async (args: UseItemArgs) => {
            const { data } = await apiClient.post<UseItemResult>('/api/inventory/use', args);
            return data;
        },
        // Invalidated rather than patched, and never optimistically. The burn is a
        // transaction: until the server says it landed, the item is still the player's, and
        // a bag that already showed it gone would be lying about a spend that could fail.
        // The pet's battle progression moved too, so the caller refreshes that itself —
        // this hook does not know which pet query the screen is using.
        onSuccess: (_result, args) => {
            void queryClient.invalidateQueries({ queryKey: inventoryQueryKey(baseURL, args.chain) });
        },
    });

    return {
        useItem: mutation.mutateAsync,
        isPending: mutation.isPending,
        error: mutation.error as Error | null,
        reset: mutation.reset,
    };
};
