import { useQuery } from '@tanstack/react-query';
import { useApiClient } from '../../contexts/ApiClientContext';
import { useAuth } from '../../contexts/AuthContext';
import type { PetChain } from '../../types/pet';
import type { EquippedItem, ItemDefinition } from '../../types/item';
import { toItemDefinition } from './useInventory';

/**
 * What a pet has equipped (roadmap §4).
 *
 * Any pet, not only the caller's: gear changes a pet's stats in a battle anyone can be
 * matched into, so an opponent's loadout is something a player is entitled to see before
 * committing. Empty slots are omitted by the server.
 */

const PET_EQUIPMENT_QUERY = `
    query PetEquipment($chain: String!, $petId: String!) {
        petEquipment(chain: $chain, petId: $petId) {
            slot
            item { itemType key category slot rarity effect name description }
        }
    }
`;

interface WireItem extends Omit<ItemDefinition, 'effect'> {
    effect: string | null;
}

interface GraphQLResponse {
    data?: { petEquipment: { slot: number; item: WireItem }[] };
    errors?: { message: string }[];
}

export interface UsePetEquipmentOptions {
    chain: PetChain | null;
    /** Pet id as a decimal string; the query is disabled until this is set. */
    petId: string | null;
    enabled?: boolean;
}

export interface UsePetEquipmentResult {
    equipped: EquippedItem[];
    /** Lookup by slot index, for a UI drawing one tile per slot including the empty ones. */
    bySlot: Map<number, EquippedItem>;
    isLoading: boolean;
    error: Error | null;
    refetch(): void;
}

/** Query key, exported so an equip mutation can invalidate exactly this pet. */
export function petEquipmentQueryKey(baseURL: string, chain: PetChain | null, petId: string | null): unknown[] {
    return ['petEquipment', baseURL, chain, petId];
}

export const usePetEquipment = ({
    chain,
    petId,
    enabled = true,
}: UsePetEquipmentOptions): UsePetEquipmentResult => {
    const apiClient = useApiClient();
    const { isAuthenticated } = useAuth();
    const baseURL = apiClient.defaults.baseURL ?? '';

    const query = useQuery({
        queryKey: petEquipmentQueryKey(baseURL, chain, petId),
        enabled: enabled && chain != null && petId != null && isAuthenticated,
        queryFn: async () => {
            const { data } = await apiClient.post<GraphQLResponse>('/graphql', {
                query: PET_EQUIPMENT_QUERY,
                variables: { chain, petId },
            });

            if (data.errors?.length) {
                throw new Error(data.errors.map((e) => e.message).join('; '));
            }

            return (data.data?.petEquipment ?? []).map((entry) => ({
                slot: entry.slot,
                item: toItemDefinition(entry.item),
            }));
        },
    });

    const equipped = query.data ?? [];
    return {
        equipped,
        bySlot: new Map(equipped.map((entry) => [entry.slot, entry])),
        isLoading: query.isLoading,
        error: query.error as Error | null,
        refetch: () => void query.refetch(),
    };
};
