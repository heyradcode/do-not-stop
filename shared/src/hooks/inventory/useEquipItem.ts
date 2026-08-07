import { useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '../../contexts/ApiClientContext';
import { useInventoryAdapter } from '../adapters/useInventoryAdapter';
import type { TxLifecycle } from '../adapters/types';
import type { PetChain } from '../../types/pet';
import { inventoryQueryKey } from './useInventory';
import { petEquipmentQueryKey } from './usePetEquipment';

/**
 * Equipping and unequipping (roadmap §4).
 *
 * The player signs these, unlike spending a consumable: `ItemCore.equip` requires
 * `msg.sender` to be the pet's owner, so the backend physically cannot send one. That is
 * the property making gear in a battle snapshot checkable against chain state by an
 * outsider, so it is worth the wallet prompt.
 *
 * What this adds over calling the adapter directly is knowing what to invalidate. Equipping
 * escrows the token into the contract, so it moves the pet's slots *and* the wallet's
 * balance, and a call site that refreshed only the first would leave the bag showing an
 * item that is no longer there.
 */

export interface UseEquipItemOptions {
    chain: PetChain | null;
    /** Pet whose slots to refresh once the transaction lands. */
    petId: string | null;
}

export interface UseEquipItemResult {
    /** False when the chain has no item contract; render a reason, not a dead button. */
    canEquip: boolean;
    equip(slot: number, itemType: string): Promise<void>;
    unequip(slot: number): Promise<void>;
    equipLifecycle: TxLifecycle;
    unequipLifecycle: TxLifecycle;
    isPending: boolean;
}

export const useEquipItem = ({ chain, petId }: UseEquipItemOptions): UseEquipItemResult => {
    const adapter = useInventoryAdapter();
    const queryClient = useQueryClient();
    const apiClient = useApiClient();
    const baseURL = apiClient.defaults.baseURL ?? '';

    /**
     * Refreshes both views after a confirmed transaction.
     *
     * Worth being honest about the timing: these read the indexed projection, not the
     * chain, so the new state only appears once indexer-go has seen the event and written
     * it. Invalidating here starts that catch-up rather than completing it, and a UI should
     * expect one poll interval of lag rather than an instant swap. Reading the contract
     * directly would remove the lag and reintroduce two sources of truth for what a pet is
     * wearing, which is the thing the indexed table exists to prevent.
     */
    const refresh = async (): Promise<void> => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: petEquipmentQueryKey(baseURL, chain, petId) }),
            queryClient.invalidateQueries({ queryKey: inventoryQueryKey(baseURL, chain) }),
        ]);
    };

    return {
        canEquip: adapter.canEquip,
        equip: async (slot, itemType) => {
            if (!petId) throw new Error('No pet selected');
            await adapter.equip.mutateAsync({ petId, slot, itemType });
            await refresh();
        },
        unequip: async (slot) => {
            if (!petId) throw new Error('No pet selected');
            await adapter.unequip.mutateAsync({ petId, slot });
            await refresh();
        },
        equipLifecycle: adapter.equip.lifecycle,
        unequipLifecycle: adapter.unequip.lifecycle,
        isPending: adapter.equip.isPending || adapter.unequip.isPending,
    };
};
