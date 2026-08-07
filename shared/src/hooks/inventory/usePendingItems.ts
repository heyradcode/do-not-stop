import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '../../contexts/ApiClientContext';
import { useAuth } from '../../contexts/AuthContext';
import type { PetChain } from '../../types/pet';
import type { ItemDefinition } from '../../types/item';
import { inventoryQueryKey, toItemDefinition } from './useInventory';

/**
 * Items earned but not yet minted, and the claim that mints them (roadmap §4).
 *
 * Kept apart from the bag because these are not items yet: nothing on chain reflects one
 * until the claim lands, so showing them together would offer a player a stack they cannot
 * spend. The two-step exists because minting costs gas, and a battle should not wait on a
 * transaction to finish settling.
 */

const PENDING_QUERY = `
    query PendingItems($chain: String!) {
        pendingItems(chain: $chain) {
            entitlementId
            item { itemType key category slot rarity effect name description }
            quantity
            source
            sourceRef
            createdAt
        }
    }
`;

interface WireItem extends Omit<ItemDefinition, 'effect'> {
    effect: string | null;
}

interface WirePending {
    entitlementId: string;
    item: WireItem;
    quantity: number;
    source: string;
    sourceRef: string;
    createdAt: string;
}

interface GraphQLResponse {
    data?: { pendingItems: WirePending[] };
    errors?: { message: string }[];
}

export interface PendingItem {
    entitlementId: string;
    item: ItemDefinition;
    quantity: number;
    /** 'battle_drop' | 'admin_grant'. */
    source: string;
    /** The battle id for a drop, so a UI can say which fight paid it. */
    sourceRef: string;
    createdAt: string;
}

export interface UsePendingItemsResult {
    pending: PendingItem[];
    isLoading: boolean;
    error: Error | null;
    /** Mints one entitlement. Resolves once the transaction has landed. */
    claim(entitlementId: string): Promise<void>;
    /** The entitlement currently being claimed, so a row can show its own spinner. */
    claimingId: string | null;
    claimError: Error | null;
}

export function pendingItemsQueryKey(baseURL: string, chain: PetChain | null): unknown[] {
    return ['pendingItems', baseURL, chain];
}

export const usePendingItems = (chain: PetChain | null): UsePendingItemsResult => {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    const { isAuthenticated } = useAuth();
    const baseURL = apiClient.defaults.baseURL ?? '';

    const query = useQuery({
        queryKey: pendingItemsQueryKey(baseURL, chain),
        enabled: chain != null && isAuthenticated,
        queryFn: async () => {
            const { data } = await apiClient.post<GraphQLResponse>('/graphql', {
                query: PENDING_QUERY,
                variables: { chain },
            });

            if (data.errors?.length) {
                throw new Error(data.errors.map((e) => e.message).join('; '));
            }

            return (data.data?.pendingItems ?? []).map((entry) => ({
                ...entry,
                item: toItemDefinition(entry.item),
            }));
        },
    });

    const mutation = useMutation({
        mutationFn: async (entitlementId: string) => {
            await apiClient.post(`/api/inventory/entitlements/${entitlementId}/claim`, {});
        },
        // Both lists move: the entitlement leaves this one and the item joins the bag. The
        // bag will lag by an indexer poll, since the mint has to be seen before the balance
        // exists — invalidating starts that catch-up rather than completing it.
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: pendingItemsQueryKey(baseURL, chain) });
            void queryClient.invalidateQueries({ queryKey: inventoryQueryKey(baseURL, chain) });
        },
    });

    return {
        pending: query.data ?? [],
        isLoading: query.isLoading,
        error: query.error as Error | null,
        claim: async (entitlementId) => {
            await mutation.mutateAsync(entitlementId);
        },
        claimingId: mutation.isPending ? (mutation.variables ?? null) : null,
        claimError: mutation.error as Error | null,
    };
};
