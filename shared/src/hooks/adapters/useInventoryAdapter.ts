import { useWaitForTransactionReceipt, useWriteContract } from 'wagmi';

import { usePetsConfig } from '../../contexts/PetsConfigContext';
import { useActiveChain } from '../session/useActiveChain';
import type { AdapterMutation, TxLifecycle, TxPhase } from './types';
import type { EquipArgs, InventoryAdapter, UnequipArgs } from './inventoryTypes';

/**
 * The active chain's inventory adapter (roadmap §4).
 *
 * Mirrors `useChainAdapter`'s shape: both branches are evaluated every render (rules of
 * hooks) and the inactive one simply refuses to write. There is no Solana implementation
 * to mount, because that chain has no item contract — §4 is EVM-first — so the Solana case
 * is the same disabled adapter as "no wallet connected".
 */

type WriteState = {
    writeContractAsync: (args: never) => Promise<`0x${string}`>;
    data?: `0x${string}`;
    isPending: boolean;
    error: unknown;
    reset: () => void;
};
type ReceiptState = { isSuccess: boolean; isError: boolean; error: unknown };

/** Same projection `useEvmAdapter` uses, so both adapters report a transaction alike. */
const toLifecycle = (w: WriteState, r: ReceiptState): TxLifecycle => {
    const writeError = w.error as Error | null;
    const receiptError = r.isError ? (r.error as Error | null) : null;
    const error = writeError ?? receiptError;
    let phase: TxPhase = 'idle';
    if (error) phase = 'error';
    else if (r.isSuccess) phase = 'success';
    else if (w.data) phase = 'confirming';
    else if (w.isPending) phase = 'awaiting-wallet';
    return { phase, hash: w.data, error, reset: w.reset };
};

const isInFlight = (w: WriteState, r: ReceiptState): boolean =>
    w.isPending || (!!w.data && !r.isSuccess && !r.isError);

const IDLE_LIFECYCLE: TxLifecycle = { phase: 'idle', error: null, reset: () => {} };

/** The adapter a chain with no item contract presents: honest, and never throws silently. */
const disabledAdapter = (kind: InventoryAdapter['kind'], reason: string): InventoryAdapter => ({
    kind,
    canEquip: false,
    equip: {
        mutateAsync: () => Promise.reject(new Error(reason)),
        lifecycle: IDLE_LIFECYCLE,
        isPending: false,
    },
    unequip: {
        mutateAsync: () => Promise.reject(new Error(reason)),
        lifecycle: IDLE_LIFECYCLE,
        isPending: false,
    },
});

export const useInventoryAdapter = (): InventoryAdapter => {
    const chain = useActiveChain();
    const { evm } = usePetsConfig();

    const itemCoreAddress = evm?.itemCore?.address;
    const itemCoreAbi = evm?.itemCore?.abi ?? [];
    const canEquip = chain.kind === 'evm' && Boolean(itemCoreAddress);

    // One write hook per action, so an equip in flight does not blank an unequip's error.
    const equipW = useWriteContract();
    const unequipW = useWriteContract();
    const equipR = useWaitForTransactionReceipt({ hash: equipW.data, query: { enabled: !!equipW.data } });
    const unequipR = useWaitForTransactionReceipt({ hash: unequipW.data, query: { enabled: !!unequipW.data } });

    const equip: AdapterMutation<EquipArgs> = {
        async mutateAsync({ petId, slot, itemType }) {
            if (!canEquip) throw new Error('ItemCore is not configured on this deployment');
            await equipW.writeContractAsync({
                address: itemCoreAddress,
                abi: itemCoreAbi,
                functionName: 'equip',
                // Pet id and item type are uint256 on chain and decimal strings here,
                // because both can exceed what a JS number holds. The slot cannot.
                args: [BigInt(petId), slot, BigInt(itemType)],
                chainId: evm?.chainId,
            } as unknown as Parameters<typeof equipW.writeContractAsync>[0]);
        },
        lifecycle: toLifecycle(equipW as WriteState, equipR),
        isPending: isInFlight(equipW as WriteState, equipR),
    };

    const unequip: AdapterMutation<UnequipArgs> = {
        async mutateAsync({ petId, slot }) {
            if (!canEquip) throw new Error('ItemCore is not configured on this deployment');
            await unequipW.writeContractAsync({
                address: itemCoreAddress,
                abi: itemCoreAbi,
                functionName: 'unequip',
                args: [BigInt(petId), slot],
                chainId: evm?.chainId,
            } as unknown as Parameters<typeof unequipW.writeContractAsync>[0]);
        },
        lifecycle: toLifecycle(unequipW as WriteState, unequipR),
        isPending: isInFlight(unequipW as WriteState, unequipR),
    };

    if (chain.kind === 'solana') {
        // Not a gap to fill later so much as the current scope: §4 validates the item and
        // equip model on EVM before porting it, and an SPL Token-2022 mint per item type is
        // a different shape from an ERC-1155 id.
        return disabledAdapter('solana', 'Items are not available on Solana yet');
    }
    if (!canEquip) {
        return disabledAdapter(chain.kind === 'evm' ? 'evm' : 'none', 'ItemCore is not configured on this deployment');
    }

    return { kind: 'evm', canEquip, equip, unequip };
};
