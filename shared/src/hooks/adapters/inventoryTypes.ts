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
    /** Pet id as a decimal string. */
    petId: string;
    /** Equip slot 0-2 (ItemCore.SLOT_*). */
    slot: number;
    /** ERC-1155 token id as a decimal string. */
    itemType: string;
}

export interface UnequipArgs {
    petId: string;
    slot: number;
}

export interface InventoryAdapter {
    kind: 'evm' | 'solana' | 'none';
    /**
     * Whether this chain can equip at all.
     *
     * False on Solana, which has no item contract yet (§4 is EVM-first), and false on EVM
     * when `itemCore` is unconfigured. A UI reads this to disable the control with a reason
     * rather than offering a button that throws.
     */
    canEquip: boolean;
    equip: AdapterMutation<EquipArgs>;
    unequip: AdapterMutation<UnequipArgs>;
}
