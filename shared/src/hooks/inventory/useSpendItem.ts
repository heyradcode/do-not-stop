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
        // The pet's battle progression moved too, so the caller refreshes that itself —
        // this hook does not know which pet query the screen is using.
        onSuccess: (_result, args) => {
            void queryClient.invalidateQueries({ queryKey: inventoryQueryKey(baseURL, args.chain) });
        },
    });

    return {
        spend: mutation.mutateAsync,
        isPending: mutation.isPending,
        error: mutation.error as Error | null,
        reset: mutation.reset,
    };
};
