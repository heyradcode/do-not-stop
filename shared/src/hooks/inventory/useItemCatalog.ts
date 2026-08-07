import { useQuery } from '@tanstack/react-query';
import { useApiClient } from '../../contexts/ApiClientContext';
import { useAuth } from '../../contexts/AuthContext';
import type { ItemDefinition } from '../../types/item';
import { toItemDefinition } from './useInventory';

/**
 * The whole item catalog (roadmap §4).
 *
 * Cached hard: this is content that changes when someone runs the seeder, not per-render
 * data. A bag view, an equip picker and a drop notification all want the same definitions,
 * and re-fetching them per surface would be the same rows over and over.
 */

const CATALOG_QUERY = `
    query ItemCatalog {
        itemCatalog { itemType key category slot rarity effect name description }
    }
`;

interface WireItem extends Omit<ItemDefinition, 'effect'> {
    effect: string | null;
}

interface GraphQLResponse {
    data?: { itemCatalog: WireItem[] };
    errors?: { message: string }[];
}

export interface UseItemCatalogResult {
    items: ItemDefinition[];
    /** Lookup by token id, which is what every other read joins on. */
    byType: Map<string, ItemDefinition>;
    isLoading: boolean;
    error: Error | null;
}

/**
 * How long the catalog is treated as fresh.
 *
 * Five minutes rather than Infinity: a seeder run should reach an open tab eventually
 * without a reload, and an item whose description is five minutes stale costs nothing.
 */
const CATALOG_STALE_MS = 5 * 60 * 1000;

export const useItemCatalog = (options: { enabled?: boolean } = {}): UseItemCatalogResult => {
    const { enabled = true } = options;
    const apiClient = useApiClient();
    const { isAuthenticated } = useAuth();
    const baseURL = apiClient.defaults.baseURL ?? '';

    const query = useQuery({
        queryKey: ['itemCatalog', baseURL],
        enabled: enabled && isAuthenticated,
        staleTime: CATALOG_STALE_MS,
        queryFn: async () => {
            const { data } = await apiClient.post<GraphQLResponse>('/graphql', { query: CATALOG_QUERY });

            if (data.errors?.length) {
                throw new Error(data.errors.map((e) => e.message).join('; '));
            }

            return (data.data?.itemCatalog ?? []).map(toItemDefinition);
        },
    });

    const items = query.data ?? [];
    return {
        items,
        byType: new Map(items.map((item) => [item.itemType, item])),
        isLoading: query.isLoading,
        error: query.error as Error | null,
    };
};
