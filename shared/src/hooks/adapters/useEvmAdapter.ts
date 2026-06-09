import { useMemo } from 'react';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { isAddress } from 'viem';
import { usePetsContract } from '../chains/ethereum/usePetsContract';
import { usePetsConfig } from '../../contexts/PetsConfigContext';
import { mapEvmPet, type EvmRawPet } from '../../utils/pets/mapEvmPet';
import type { Pet } from '../../types/pet';
import type { ChainAdapter, AdapterMutation, TxLifecycle, TxPhase, ChainCapabilities } from './types';

const EVM_CAPABILITIES: ChainCapabilities = {
    chainLabel: 'Ethereum',
    address: {
        label: 'Recipient Ethereum Address:',
        placeholder: '0x…',
        isValid: (v) => isAddress(v),
    },
    levelUpFee: { amount: '0.001', symbol: 'ETH' },
    renameMinLevel: 2,
    randomness: { provider: 'chainlink', appliesTo: ['breed'] },
    explorerTxUrl: () => null,
};

type WriteState = {
    isPending: boolean;
    data: `0x${string}` | undefined;
    error: unknown;
    reset: () => void;
};
type ReceiptState = { isSuccess: boolean; isError: boolean; error: unknown };

function toLc(w: WriteState, r: ReceiptState): TxLifecycle {
    const writeError = w.error as Error | null;
    const receiptError = r.isError ? (r.error as Error | null) : null;
    const error = writeError ?? receiptError;
    let phase: TxPhase = 'idle';
    if (error) phase = 'error';
    else if (r.isSuccess) phase = 'success';
    else if (w.data) phase = 'confirming';
    else if (w.isPending) phase = 'awaiting-wallet';
    return { phase, hash: w.data, error, reset: w.reset };
}

function isInFlight(w: WriteState, r: ReceiptState): boolean {
    return w.isPending || (!!w.data && !r.isSuccess && !r.isError);
}

export function useEvmAdapter({ enabled }: { enabled: boolean }): ChainAdapter {
    const { evm } = usePetsConfig();
    const contractAddress = evm?.contractAddress;
    const abi = evm?.abi ?? [];
    const safeAddress = (contractAddress ?? '0x0000000000000000000000000000000000000000') as `0x${string}`;
    const canWrite = enabled && Boolean(contractAddress);

    // Reads — usePetsContract also provides the caller address for transferFrom.
    const reads = usePetsContract({ contractAddress, abi, enabled });
    const evmPets = useMemo<Pet[]>(() => {
        if (!enabled) return [];
        return (reads.pets as unknown as EvmRawPet[]).map(
            (raw, i) => mapEvmPet(raw, reads.petIds[i] ?? BigInt(i)),
        );
    }, [enabled, reads.pets, reads.petIds]);

    // Per-action write hooks — each has isolated hash, isPending, error, reset.
    const createW = useWriteContract();
    const levelUpW = useWriteContract();
    const renameW = useWriteContract();
    const transferW = useWriteContract();
    const battleW = useWriteContract();
    const breedW = useWriteContract();

    // Per-action receipt watchers — enabled only when the corresponding hash exists.
    const createR = useWaitForTransactionReceipt({ hash: createW.data, query: { enabled: !!createW.data } });
    const levelUpR = useWaitForTransactionReceipt({ hash: levelUpW.data, query: { enabled: !!levelUpW.data } });
    const renameR = useWaitForTransactionReceipt({ hash: renameW.data, query: { enabled: !!renameW.data } });
    const transferR = useWaitForTransactionReceipt({ hash: transferW.data, query: { enabled: !!transferW.data } });
    const battleR = useWaitForTransactionReceipt({ hash: battleW.data, query: { enabled: !!battleW.data } });
    const breedR = useWaitForTransactionReceipt({ hash: breedW.data, query: { enabled: !!breedW.data } });

    const createPet: AdapterMutation<{ name: string }> = {
        async mutateAsync({ name }) {
            if (!canWrite) throw new Error('EVM contract not configured');
            await createW.writeContractAsync({ address: safeAddress, abi, functionName: 'createRandom', args: [name], gas: 500000n });
        },
        lifecycle: toLc(createW, createR),
        isPending: isInFlight(createW, createR),
    };

    const levelUpPet: AdapterMutation<{ petId: string }> = {
        async mutateAsync({ petId }) {
            if (!canWrite) throw new Error('EVM contract not configured');
            await levelUpW.writeContractAsync({
                address: safeAddress, abi, functionName: 'levelUp',
                args: [BigInt(petId)], value: 1000000000000000n, gas: 200000n,
            } as unknown as Parameters<typeof levelUpW.writeContractAsync>[0]);
        },
        lifecycle: toLc(levelUpW, levelUpR),
        isPending: isInFlight(levelUpW, levelUpR),
    };

    const renamePet: AdapterMutation<{ petId: string; name: string }> = {
        async mutateAsync({ petId, name }) {
            if (!canWrite) throw new Error('EVM contract not configured');
            await renameW.writeContractAsync({ address: safeAddress, abi, functionName: 'changeName', args: [BigInt(petId), name], gas: 100000n });
        },
        lifecycle: toLc(renameW, renameR),
        isPending: isInFlight(renameW, renameR),
    };

    const transferPet: AdapterMutation<{ petId: string; to: string }> = {
        async mutateAsync({ petId, to }) {
            if (!canWrite || !reads.address) throw new Error('EVM contract not configured or wallet not connected');
            await transferW.writeContractAsync({
                address: safeAddress, abi, functionName: 'transferFrom',
                args: [reads.address, to as `0x${string}`, BigInt(petId)], gas: 200000n,
            });
        },
        lifecycle: toLc(transferW, transferR),
        isPending: isInFlight(transferW, transferR),
    };

    const battlePets: AdapterMutation<{ petId1: string; petId2: string; defenderOwner?: string }> = {
        async mutateAsync({ petId1, petId2 }) {
            if (!canWrite) throw new Error('EVM contract not configured');
            await battleW.writeContractAsync({ address: safeAddress, abi, functionName: 'battle', args: [BigInt(petId1), BigInt(petId2)], gas: 300000n });
        },
        lifecycle: toLc(battleW, battleR),
        isPending: isInFlight(battleW, battleR),
    };

    const breedPets: AdapterMutation<{ parentId1: string; parentId2: string; name: string }> = {
        async mutateAsync({ parentId1, parentId2, name }) {
            if (!canWrite) throw new Error('EVM contract not configured');
            await breedW.writeContractAsync({ address: safeAddress, abi, functionName: 'requestCreateFromDNA', args: [BigInt(parentId1), BigInt(parentId2), name], gas: 800000n });
        },
        lifecycle: toLc(breedW, breedR),
        isPending: isInFlight(breedW, breedR),
    };

    return {
        kind: 'evm',
        address: reads.address ?? null,
        isConnected: enabled && reads.isConnected,
        capabilities: EVM_CAPABILITIES,
        pets: {
            data: evmPets,
            isLoading: reads.isLoading,
            error: (reads.contractError as Error | undefined) ?? null,
            refetch: () => { reads.refetchPetIds(); void reads.refetchPetsData(); },
        },
        createPet,
        levelUpPet,
        renamePet,
        transferPet,
        battlePets,
        breedPets,
    };
}
