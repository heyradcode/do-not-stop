import { useState } from 'react';
import { useWaitForTransactionReceipt, useWriteContract } from 'wagmi';

import { usePetsConfig } from '../../contexts/PetsConfigContext';
import { useProgram } from '../chains/solana/useProgram';
import { useSolanaAnchor } from '../../contexts/SolanaAnchorContext';
import { equipItemOnSolana, unequipItemOnSolana } from '../../utils/solana/equipItem';
import { useActiveChain } from '../session/useActiveChain';
import type { AdapterMutation, TxLifecycle, TxPhase } from './types';
import type { EquipArgs, InventoryAdapter, UnequipArgs } from './inventoryTypes';

/**
 * The active chain's inventory adapter (roadmap §4).
 *
 * Mirrors `useChainAdapter`'s shape: both branches are evaluated every render (rules of
 * hooks) and the inactive one simply refuses to write. Both chains have an item contract
 * now, so the disabled adapter is left for what it always described honestly: no wallet
 * connected, or a deployment that never configured one.
 *
 * The two branches differ in more than which call they make. EVM's is a wagmi write with a
 * transaction hash and a receipt to wait on, so its lifecycle has real intermediate states.
 * A Solana `.rpc()` resolves once confirmed and there is nothing to poll, so its lifecycle
 * reports pending and then done. Reporting a fake `confirming` phase to make them look alike
 * would be a worse lie than the asymmetry.
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

/** Solana unequip needs the item type; EVM does not, so the field is optional. */
const requireItemType = (itemType: string | undefined): string => {
    if (!itemType) {
        throw new Error('unequip on Solana needs the item type, to name the balance it returns to');
    }
    return itemType;
};

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

    // Both chains' hooks run every render, per the rules of hooks; the inactive one's
    // results are simply not returned.
    const { program, programId } = useProgram();
    const { signingWallet } = useSolanaAnchor();
    const solanaOwner = signingWallet?.publicKey ?? null;

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

    // Solana's writes are a single `.rpc()` that resolves on confirmation, so the lifecycle
    // is tracked here rather than derived from a wagmi hook pair.
    const [solanaPhase, setSolanaPhase] = useState<TxPhase>('idle');
    const [solanaError, setSolanaError] = useState<Error | null>(null);
    const solanaCanEquip = chain.kind === 'solana' && Boolean(program && programId && solanaOwner);

    const runSolana = async (send: () => Promise<string>) => {
        if (!program || !programId || !solanaOwner) throw new Error('Solana wallet is not connected');
        setSolanaPhase('awaiting-wallet');
        setSolanaError(null);
        try {
            await send();
            setSolanaPhase('success');
        } catch (error) {
            setSolanaError(error as Error);
            setSolanaPhase('error');
            throw error;
        }
    };

    const solanaLifecycle: TxLifecycle = {
        phase: solanaPhase,
        error: solanaError,
        reset: () => {
            setSolanaPhase('idle');
            setSolanaError(null);
        },
    };

    const solanaEquip: AdapterMutation<EquipArgs> = {
        mutateAsync: ({ petId, slot, itemType }) =>
            runSolana(() =>
                // `petId` is the Core asset pubkey here, because that is what the
                // equipment PDA is seeded by. It is NOT what `pet_equipment.pet_id`
                // holds: that column carries the numeric id, so the projection can be
                // joined to `pet_roster`. `equipItemOnSolana` rejects a numeric id
                // rather than deriving an address nothing lives at.
                equipItemOnSolana({ program: program!, programId: programId!, owner: solanaOwner!, assetKey: petId, slot, itemType }),
            ),
        lifecycle: solanaLifecycle,
        isPending: solanaPhase === 'awaiting-wallet',
    };

    const solanaUnequip: AdapterMutation<UnequipArgs> = {
        mutateAsync: ({ petId, slot, itemType }) =>
            runSolana(() =>
                unequipItemOnSolana({
                    program: program!,
                    programId: programId!,
                    owner: solanaOwner!,
                    assetKey: petId,
                    slot,
                    // Required here and unused on EVM: Solana returns the item to a balance
                    // PDA seeded by its type, so there is no address to credit without it.
                    // Defaulting would derive a real address holding the wrong stack.
                    itemType: requireItemType(itemType),
                }),
            ),
        lifecycle: solanaLifecycle,
        isPending: solanaPhase === 'awaiting-wallet',
    };

    if (chain.kind === 'solana') {
        return solanaCanEquip
            ? { kind: 'solana', canEquip: true, equip: solanaEquip, unequip: solanaUnequip }
            : disabledAdapter('solana', 'Connect a Solana wallet to equip');
    }
    if (!canEquip) {
        return disabledAdapter(chain.kind === 'evm' ? 'evm' : 'none', 'ItemCore is not configured on this deployment');
    }

    return { kind: 'evm', canEquip, equip, unequip };
};
