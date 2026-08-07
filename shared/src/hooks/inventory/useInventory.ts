import { useQuery } from '@tanstack/react-query';
import { useApiClient } from '../../contexts/ApiClientContext';
import { useAuth } from '../../contexts/AuthContext';
import type { PetChain } from '../../types/pet';
import { parseItemEffect, type InventoryEntry, type ItemDefinition } from '../../types/item';

/**
 * The caller's own items (roadmap §4).
 *
 * There is no owner argument, and that is the point: the backend takes it from the session,
 * so there is no spelling of this that reads another wallet's bag. It also means the query
 * key does not need an address in it — the session already varies with `baseURL`.
 */

const INVENTORY_QUERY = `
    query Inventory($chain: String!) {
        inventory(chain: $chain) {
            item { itemType key category slot rarity effect name description }
            quantity
        }
    }
`;

/** The wire shape: `effect` arrives as a JSON string and is parsed on the way out. */
interface WireItem extends Omit<ItemDefinition, 'effect'> {
    effect: string | null;
}

interface GraphQLResponse {
    data?: { inventory: { item: WireItem; quantity: string }[] };
    errors?: { message: string }[];
}

export interface UseInventoryOptions {
    /** Active chain; the query is disabled until this is set. */
    chain: PetChain | null;
    enabled?: boolean;
}

export interface UseInventoryResult {
    entries: InventoryEntry[];
    isLoading: boolean;
    error: Error | null;
    refetch(): void;
}

/** Query key, exported so a mutation elsewhere can invalidate this without guessing it. */
export function inventoryQueryKey(baseURL: string, chain: PetChain | null): unknown[] {
    return ['inventory', baseURL, chain];
}

export function toItemDefinition(item: WireItem): ItemDefinition {
    return { ...item, effect: parseItemEffect(item.effect) };
}

export const useInventory = ({ chain, enabled = true }: UseInventoryOptions): UseInventoryResult => {
    const apiClient = useApiClient();
    const { isAuthenticated } = useAuth();
    const baseURL = apiClient.defaults.baseURL ?? '';

    const query = useQuery({
        queryKey: inventoryQueryKey(baseURL, chain),
        // Authenticated only, and not merely because /graphql sits behind the JWT: without
        // a session the server has no owner to answer for and returns an empty bag, which
        // would render as "you own nothing" rather than as "sign in".
        enabled: enabled && chain != null && isAuthenticated,
        queryFn: async () => {
            const { data } = await apiClient.post<GraphQLResponse>('/graphql', {
                query: INVENTORY_QUERY,
                variables: { chain },
            });

            if (data.errors?.length) {
                throw new Error(data.errors.map((e) => e.message).join('; '));
            }

            return (data.data?.inventory ?? []).map((entry) => ({
                item: toItemDefinition(entry.item),
                quantity: entry.quantity,
            }));
        },
    });

    return {
        entries: query.data ?? [],
        isLoading: query.isLoading,
        error: query.error as Error | null,
        refetch: () => void query.refetch(),
    };
};
