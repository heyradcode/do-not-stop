import { useQuery } from '@tanstack/react-query';
import { useApiClient } from '../../contexts/ApiClientContext';
import { useAuth } from '../../contexts/AuthContext';
import type { PetChain } from '../../types/pet';
import type { EquippedItem } from '../../types/item';
import { ITEM_FIELDS, toItemDefinition, type WireItem } from './useInventory';

/**
 * What several pets have equipped, in one request (roadmap §4).
 *
 * The batched counterpart to `usePetEquipment`. A gallery or a matchmaking list draws a whole
 * roster at once, and one query per card is the difference between a screen that loads and a
 * screen that hammers the API — the same reason `useBattleProgress` takes a list of ids.
 *
 * Pets with nothing equipped are absent from the response, so the map simply has no entry for
 * them. Callers should read a missing key as "no gear" rather than as "not loaded"; the
 * query's own `isLoading` is what distinguishes those.
 */

const PET_EQUIPMENT_FOR_PETS_QUERY = `
    query PetEquipmentForPets($chain: String!, $petIds: [String!]!) {
        petEquipmentForPets(chain: $chain, petIds: $petIds) {
            petId
            equipped {
                slot
                item { ${ITEM_FIELDS} }
            }
        }
    }
`;

interface GraphQLResponse {
    data?: { petEquipmentForPets: { petId: string; equipped: { slot: number; item: WireItem }[] }[] };
    errors?: { message: string }[];
}

export interface UsePetEquipmentForPetsOptions {
    chain: PetChain | null;
    /** Pet ids as decimal strings. The query is disabled while this is empty. */
    petIds: string[];
    enabled?: boolean;
}

export interface UsePetEquipmentForPetsResult {
    /** Pet id to its filled slots. A pet with no gear has no entry. */
    byPet: Map<string, EquippedItem[]>;
    isLoading: boolean;
    error: Error | null;
    refetch(): void;
}

/**
 * Query key, sorted and joined rather than taking the array as-is.
 *
 * A gallery re-renders with the same pets in a different order all the time — a refetch, a
 * re-sort — and an array key compares by identity, so every one of those would miss the cache
 * and refetch identical data.
 */
export function petEquipmentForPetsQueryKey(
    baseURL: string,
    chain: PetChain | null,
    petIds: string[],
): unknown[] {
    return [...petEquipmentForPetsQueryPrefix(baseURL, chain), [...petIds].sort().join(',')];
}

/**
 * Every batched-equipment query for one chain, whatever set of pets it asked about.
 *
 * Invalidating needs this rather than the full key. An equip happens on one pet, but the
 * cached entries are keyed by the *list* a screen asked for — the gallery's twenty ids, the
 * arena's two — and the mutation has no idea which lists exist. Matching on the prefix
 * catches all of them; matching on an exact key would silently miss every one.
 */
export function petEquipmentForPetsQueryPrefix(baseURL: string, chain: PetChain | null): unknown[] {
    return ['petEquipmentForPets', baseURL, chain];
}

/** One shared empty map. `query.data ?? new Map()` mints a new identity on every render
 *  while the query is loading or disabled, which invalidates callers' `useMemo` on gear
 *  during exactly the window the memo exists for. */
const NO_GEAR: Map<string, EquippedItem[]> = new Map();

export const usePetEquipmentForPets = ({
    chain,
    petIds,
    enabled = true,
}: UsePetEquipmentForPetsOptions): UsePetEquipmentForPetsResult => {
    const apiClient = useApiClient();
    const { isAuthenticated } = useAuth();
    const baseURL = apiClient.defaults.baseURL ?? '';

    const query = useQuery({
        queryKey: petEquipmentForPetsQueryKey(baseURL, chain, petIds),
        enabled: enabled && chain != null && petIds.length > 0 && isAuthenticated,
        queryFn: async () => {
            const { data } = await apiClient.post<GraphQLResponse>('/graphql', {
                query: PET_EQUIPMENT_FOR_PETS_QUERY,
                variables: { chain, petIds },
            });

            if (data.errors?.length) {
                throw new Error(data.errors.map((e) => e.message).join('; '));
            }

            const groups = data.data?.petEquipmentForPets ?? [];
            return new Map(
                groups.map((group) => [
                    group.petId,
                    group.equipped.map((entry) => ({ slot: entry.slot, item: toItemDefinition(entry.item) })),
                ]),
            );
        },
    });

    return {
        byPet: query.data ?? NO_GEAR,
        isLoading: query.isLoading,
        error: query.error as Error | null,
        refetch: () => void query.refetch(),
    };
};
