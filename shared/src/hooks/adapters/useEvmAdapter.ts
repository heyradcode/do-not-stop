import { useMemo } from 'react';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { isAddress } from 'viem';
import { usePetsContract } from '../chains/ethereum/usePetsContract';
import { useEvmFees } from '../chains/ethereum/useEvmFees';
import { usePetsConfig } from '../../contexts/PetsConfigContext';
import { mapEvmPet, type EvmRawPet } from '../../utils/pets/mapEvmPet';
import { parseContractError } from '../../utils/ethereum';
import type { Pet } from '../../types/pet';
import type { ChainAdapter, AdapterMutation, TxLifecycle, TxPhase, ChainCapabilities } from './types';

export const EVM_CAPABILITIES: ChainCapabilities = {
    chainLabel: 'Ethereum',
    address: {
        label: 'Recipient Ethereum Address:',
        placeholder: '0x…',
        isValid: (v) => isAddress(v),
    },
    levelUpFee: { amount: '0.004', symbol: 'ETH' },
    renameMinLevel: 2,
    randomness: { provider: 'chainlink', appliesTo: ['breed'] },
    explorerTxUrl: () => null,
    parseError: (err, _fallback) => parseContractError(err),
};

type WriteState = {
    isPending: boolean;
    data: `0x${string}` | undefined;
    error: unknown;
    reset: () => void;
};
type ReceiptState = { isSuccess: boolean; isError: boolean; error: unknown };

const toLc = (w: WriteState, r: ReceiptState): TxLifecycle  => {
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

const isInFlight = (w: WriteState, r: ReceiptState): boolean  => {
    return w.isPending || (!!w.data && !r.isSuccess && !r.isError);
}

const ZERO = '0x0000000000000000000000000000000000000000' as `0x${string}`;

export const useEvmAdapter = ({ enabled }: { enabled: boolean }): ChainAdapter  => {
    const { evm } = usePetsConfig();

    // v2 splits writes across two proxies: PetCore (ERC-721 storage, mint,
    // level/XP, rename, transfer) and GameLogic (async battle/breed/train).
    const petCoreAddress = evm?.petCore.address;
    const petCoreAbi = evm?.petCore.abi ?? [];
    const gameLogicAddress = evm?.gameLogic.address;
    const gameLogicAbi = evm?.gameLogic.abi ?? [];
    const petCore = (petCoreAddress ?? ZERO);
    const gameLogic = (gameLogicAddress ?? ZERO);
    const canWrite = enabled && Boolean(petCoreAddress) && Boolean(gameLogicAddress);

    // Reads — usePetsContract also provides the caller address for transferFrom.
    const reads = usePetsContract({ contractAddress: petCoreAddress, abi: petCoreAbi, enabled });

    // v2 fee schedule (GameConfig + per-wallet mint count). Payable writes revert
    // when underpaid, so these must resolve before mint/level/breed.
    const fees = useEvmFees(enabled);
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
    const trainW = useWriteContract();

    // Per-action receipt watchers — enabled only when the corresponding hash exists.
    const createR = useWaitForTransactionReceipt({ hash: createW.data, query: { enabled: !!createW.data } });
    const levelUpR = useWaitForTransactionReceipt({ hash: levelUpW.data, query: { enabled: !!levelUpW.data } });
    const renameR = useWaitForTransactionReceipt({ hash: renameW.data, query: { enabled: !!renameW.data } });
    const transferR = useWaitForTransactionReceipt({ hash: transferW.data, query: { enabled: !!transferW.data } });
    const battleR = useWaitForTransactionReceipt({ hash: battleW.data, query: { enabled: !!battleW.data } });
    const breedR = useWaitForTransactionReceipt({ hash: breedW.data, query: { enabled: !!breedW.data } });
    const trainR = useWaitForTransactionReceipt({ hash: trainW.data, query: { enabled: !!trainW.data } });

    // PetCore: gacha starter mint. Fee escalates per wallet:
    // baseMintFee × (1 + walletMintCount). Sent as value (contract requires >=).
    const createPet: AdapterMutation<{ name: string; dna?: bigint | number | string; rarity?: number }> = {
        async mutateAsync({ name }) {
            if (!canWrite) throw new Error('EVM contract not configured');
            if (fees.nextMintFee == null) throw new Error('Mint fee not loaded yet');
            await createW.writeContractAsync({
                address: petCore, abi: petCoreAbi, functionName: 'mintStarter',
                args: [name], value: fees.nextMintFee, gas: 500000n,
            } as unknown as Parameters<typeof createW.writeContractAsync>[0]);
        },
        lifecycle: toLc(createW, createR),
        isPending: isInFlight(createW, createR),
    };

    // PetCore: levelUp pays a level-scaled fee, capped at maxLevel.
    // fee = levelUpFee × (100 + (level-1)²) / 100 (matches the contract).
    const levelUpPet: AdapterMutation<{ petId: string }> = {
        async mutateAsync({ petId }) {
            if (!canWrite) throw new Error('EVM contract not configured');
            if (fees.levelUpFee == null) throw new Error('Level-up fee not loaded yet');
            const level = evmPets.find((p) => p.id === petId)?.level ?? 1;
            const diff = BigInt(Math.max(level - 1, 0));
            const value = (fees.levelUpFee * (100n + diff * diff)) / 100n;
            await levelUpW.writeContractAsync({
                address: petCore, abi: petCoreAbi, functionName: 'levelUp',
                args: [BigInt(petId)], value, gas: 200000n,
            } as unknown as Parameters<typeof levelUpW.writeContractAsync>[0]);
        },
        lifecycle: toLc(levelUpW, levelUpR),
        isPending: isInFlight(levelUpW, levelUpR),
    };

    // GameLogic: train pays a level-scaled fee for flat XP.
    // scaledFee = trainFee × (100 + 2·level) / 100 (matches the contract).
    const trainPet: AdapterMutation<{ petId: string }> = {
        async mutateAsync({ petId }) {
            if (!canWrite) throw new Error('EVM contract not configured');
            if (fees.trainFee == null) throw new Error('Train fee not loaded yet');
            const level = evmPets.find((p) => p.id === petId)?.level ?? 1;
            const value = (fees.trainFee * BigInt(100 + 2 * level)) / 100n;
            await trainW.writeContractAsync({
                address: gameLogic, abi: gameLogicAbi, functionName: 'train',
                args: [BigInt(petId)], value, gas: 250000n,
            } as unknown as Parameters<typeof trainW.writeContractAsync>[0]);
        },
        lifecycle: toLc(trainW, trainR),
        isPending: isInFlight(trainW, trainR),
    };

    const renamePet: AdapterMutation<{ petId: string; name: string }> = {
        async mutateAsync({ petId, name }) {
            if (!canWrite) throw new Error('EVM contract not configured');
            await renameW.writeContractAsync({ address: petCore, abi: petCoreAbi, functionName: 'changeName', args: [BigInt(petId), name], gas: 100000n });
        },
        lifecycle: toLc(renameW, renameR),
        isPending: isInFlight(renameW, renameR),
    };

    const transferPet: AdapterMutation<{ petId: string; to: string }> = {
        async mutateAsync({ petId, to }) {
            if (!canWrite || !reads.address) throw new Error('EVM contract not configured or wallet not connected');
            await transferW.writeContractAsync({
                address: petCore, abi: petCoreAbi, functionName: 'transferFrom',
                args: [reads.address, to as `0x${string}`, BigInt(petId)], gas: 200000n,
            });
        },
        lifecycle: toLc(transferW, transferR),
        isPending: isInFlight(transferW, transferR),
    };

    // GameLogic: v2 battle is async (request → VRF → settle). requestBattle makes
    // a VRF request, which the RPC can't gas-estimate (estimateGas returns the
    // block limit → "gas limit too high"), so a manual limit is REQUIRED — sized
    // like breed's working VRF path, not v1's synchronous-battle 300k.
    const battlePets: AdapterMutation<{ petId1: string; petId2: string; defenderOwner?: string }> = {
        async mutateAsync({ petId1, petId2 }) {
            if (!canWrite) throw new Error('EVM contract not configured');
            await battleW.writeContractAsync({ address: gameLogic, abi: gameLogicAbi, functionName: 'requestBattle', args: [BigInt(petId1), BigInt(petId2)], gas: 800000n });
        },
        lifecycle: toLc(battleW, battleR),
        isPending: isInFlight(battleW, battleR),
    };

    // GameLogic: breed request (payable). Same-owner requires msg.value >=
    // breedFee(); cross-owner (married) requires breedFee() + studFee().
    // Offspring is minted on BreedSettled, watched in useBreedPets.
    const breedPets: AdapterMutation<{ parentId1: string; parentId2: string; name: string; crossOwner?: boolean }> = {
        async mutateAsync({ parentId1, parentId2, name, crossOwner }) {
            if (!canWrite) throw new Error('EVM contract not configured');
            if (fees.breedFee == null) throw new Error('Breed fee not loaded yet');
            if (crossOwner && fees.studFee == null) throw new Error('Stud fee not loaded yet');
            const value = fees.breedFee + (crossOwner ? (fees.studFee ?? 0n) : 0n);
            await breedW.writeContractAsync({
                address: gameLogic, abi: gameLogicAbi, functionName: 'requestCreateFromDNA',
                args: [BigInt(parentId1), BigInt(parentId2), name], value, gas: 800000n,
            } as unknown as Parameters<typeof breedW.writeContractAsync>[0]);
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
        trainPet,
        renamePet,
        transferPet,
        battlePets,
        breedPets,
    };
}
