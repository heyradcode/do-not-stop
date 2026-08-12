import { useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '../../contexts/ApiClientContext';
import { useInventoryAdapter } from '../adapters/useInventoryAdapter';
import type { TxLifecycle } from '../adapters/types';
import type { PetChain } from '../../types/pet';
import { inventoryQueryKey } from './useInventory';
import { petEquipmentQueryKey } from './usePetEquipment';
import { petEquipmentForPetsQueryPrefix } from './usePetEquipmentForPets';

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
    /** Pet whose slots to refresh once the transaction lands. Numeric id on both chains. */
    petId: string | null;
    /**
     * The pet's Metaplex Core asset pubkey, required on Solana and ignored on EVM.
     *
     * A Solana pet has two keys and this hook needs both: `pet_equipment` is joined to
     * `pet_roster` by the numeric id, so the reads above are keyed by it, while every PDA
     * `equip`/`unequip` touches is seeded by the asset. Passing the id to the write derives
     * an address nothing lives at, which is why `equipItemOnSolana` refuses one outright.
     */
    assetKey?: string | null;
}

export interface UseEquipItemResult {
    /** False when the chain has no item contract; render a reason, not a dead button. */
    canEquip: boolean;
    equip(slot: number, itemType: string): Promise<void>;
    /**
     * `itemType` is what is currently in the slot. EVM does not need it — `ItemCore.unequip`
     * reads the slot itself — but Solana returns the item to a balance PDA seeded by its
     * type, so there is no address to credit without it. The program still checks the slot
     * against the value, so a wrong one fails rather than crediting the wrong stack.
     */
    unequip(slot: number, itemType: string): Promise<void>;
    equipLifecycle: TxLifecycle;
    unequipLifecycle: TxLifecycle;
    isPending: boolean;
}

export const useEquipItem = ({ chain, petId, assetKey }: UseEquipItemOptions): UseEquipItemResult => {
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
            // The batched read too, by prefix. The gallery and the arena cache their gear
            // under the *list* of pets they asked about, so an equip that refreshed only the
            // single-pet key left every badge on those screens showing the old loadout.
            queryClient.invalidateQueries({ queryKey: petEquipmentForPetsQueryPrefix(baseURL, chain) }),
            queryClient.invalidateQueries({ queryKey: inventoryQueryKey(baseURL, chain) }),
        ]);
    };

    /**
     * The key the *write* is addressed by, which is not the key the reads use.
     *
     * On Solana that is the Core asset; on EVM the token id is the only key there is. A
     * missing asset key is raised here rather than passed through, because the adapter would
     * otherwise see the numeric id and report it as the wrong sort of value entirely.
     */
    const writeKey = (): string => {
        if (!petId) throw new Error('No pet selected');
        if (chain !== 'solana') return petId;
        if (!assetKey) throw new Error('This Solana pet has no Core asset on record, so its gear cannot be changed');
        return assetKey;
    };

    return {
        canEquip: adapter.canEquip,
        equip: async (slot, itemType) => {
            await adapter.equip.mutateAsync({ petId: writeKey(), slot, itemType });
            await refresh();
        },
        unequip: async (slot, itemType) => {
            await adapter.unequip.mutateAsync({ petId: writeKey(), slot, itemType });
            await refresh();
        },
        equipLifecycle: adapter.equip.lifecycle,
        unequipLifecycle: adapter.unequip.lifecycle,
        isPending: adapter.equip.isPending || adapter.unequip.isPending,
    };
};
