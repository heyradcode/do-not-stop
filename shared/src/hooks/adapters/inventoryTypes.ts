import type { AdapterMutation } from './types';

/**
 * The chain-blind surface for inventory *writes that the player signs* (roadmap §4).
 *
 * A separate interface from `ChainAdapter`, not an extension of it. `AGENTS.md` forbids
 * growing that one, and §4 names this case: new domains reuse the pattern (thin interface,
 * per-chain implementation, a `useXAdapter()` that picks the active one) rather than the
 * interface itself. The practical reason is that `ChainAdapter` is about pets, and a
 * consumer holding one should not have to know whether items exist.
 *
 * Only equip and unequip live here, and the boundary is not arbitrary. `ItemCore.equip`
 * requires `msg.sender` to be the pet's owner, so those two can only ever be sent by the
 * player's own wallet. Everything else — spending a consumable, claiming a drop — is
 * settled by the backend's authorized wallet and reaches the server over REST, which is
 * why `useUseItem` is a plain mutation and these are wallet prompts.
 */

export interface EquipArgs {
    /**
     * Which pet, in the form the write needs: a decimal pet id on EVM, a Metaplex Core
     * asset pubkey on Solana, because every Solana PDA involved is seeded by the asset.
     *
     * Note this is NOT the form `pet_equipment.pet_id` stores. That column holds the
     * numeric id on both chains, so the projection can be joined to `pet_roster`.
     */
    petId: string;
    /** Equip slot 0-2 (ItemCore.SLOT_*). */
    slot: number;
    /** ERC-1155 token id as a decimal string. */
    itemType: string;
}

export interface UnequipArgs {
    petId: string;
    slot: number;
    /**
     * Which item is being removed. Optional because EVM does not need it: `ItemCore.unequip`
     * reads the slot and returns whatever is there.
     *
     * Solana does need it. The item goes back to a balance PDA seeded by its type, so
     * without it there is no address to credit, and `unequipItemOnSolana` throws rather than
     * defaulting to one that holds a different stack.
     */
    itemType?: string;
}

export interface InventoryAdapter {
    kind: 'evm' | 'solana' | 'none';
    /**
     * Whether this chain can equip at all.
     *
     * False on EVM when `itemCore` is unconfigured, and on Solana when no wallet is
     * connected. A UI reads this to disable the control with a reason rather than offering a
     * button that throws.
     */
    canEquip: boolean;
    equip: AdapterMutation<EquipArgs>;
    unequip: AdapterMutation<UnequipArgs>;
}
