import { useMemo } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { usePetsConfig } from '../../../contexts/PetsConfigContext';

// getFeeV2() is confirmed to work via eth_call on Base Sepolia — use it directly.
// It returns the exact fee the contract reads on-chain (feeInWei + any fee-manager
// overhead), which is 1 wei MORE than getProviderInfoV2.feeInWei alone.
// Sending even 1 wei less triggers "Insufficient mint/entropy fee".
const ENTROPY_V2_ABI = [
    {
        inputs: [],
        name: 'getFeeV2',
        outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function' as const,
    },
] as const;

export interface EvmFees {
    /** GameConfig.baseMintFee() — base gacha mint fee before per-wallet escalation. */
    baseMintFee?: bigint;
    /** GameConfig.levelUpFee() — base fee for PetCore.levelUp, scaled by level on-chain. */
    levelUpFee?: bigint;
    /** GameConfig.breedFee() — same-owner breed fee (stud fee is v2.1/marriage). */
    breedFee?: bigint;
    /** GameConfig.trainFee() — base train fee, scaled by level on-chain. */
    trainFee?: bigint;
    /** GameConfig.studFee() — added to breedFee for cross-owner (married) breeding. */
    studFee?: bigint;
    /** PetCore.walletMintCount(addr) — lifetime mints, drives mint escalation. */
    walletMintCount?: bigint;
    /** Next mintStarter fee for this wallet: baseMintFee × (1 + walletMintCount). */
    nextMintFee?: bigint;
    /** Pyth Entropy getFeeV2() — must be added to nextMintFee when calling requestMintStarter. */
    entropyFee?: bigint;
}

/**
 * Reads the v2 fee schedule from GameConfig (+ the caller's mint count from
 * PetCore) so write paths can attach the correct `value`. The v2 payable
 * functions revert when underpaid, so these must resolve before mint/level/breed.
 */
export const useEvmFees = (enabled: boolean): EvmFees => {
    const { evm } = usePetsConfig();
    const { address } = useAccount();

    const chainId = evm?.chainId;
    const gameConfig = evm?.gameConfig?.address;
    const gameConfigAbi = useMemo(() => evm?.gameConfig?.abi ?? [], [evm?.gameConfig?.abi]);
    const petCore = evm?.petCore.address;
    const petCoreAbi = useMemo(() => evm?.petCore.abi ?? [], [evm?.petCore.abi]);
    const gameLogic = evm?.gameLogic?.address;
    const gameLogicAbi = useMemo(() => evm?.gameLogic?.abi ?? [], [evm?.gameLogic?.abi]);

    const cfgQuery = { enabled: enabled && Boolean(gameConfig) };
    const { data: baseMintFee } = useReadContract({ address: gameConfig, abi: gameConfigAbi, functionName: 'baseMintFee', chainId, query: cfgQuery });
    const { data: levelUpFee } = useReadContract({ address: gameConfig, abi: gameConfigAbi, functionName: 'levelUpFee', chainId, query: cfgQuery });
    const { data: breedFee } = useReadContract({ address: gameConfig, abi: gameConfigAbi, functionName: 'breedFee', chainId, query: cfgQuery });
    const { data: trainFee } = useReadContract({ address: gameConfig, abi: gameConfigAbi, functionName: 'trainFee', chainId, query: cfgQuery });
    const { data: studFee } = useReadContract({ address: gameConfig, abi: gameConfigAbi, functionName: 'studFee', chainId, query: cfgQuery });

    const { data: walletMintCount } = useReadContract({
        address: petCore,
        abi: petCoreAbi,
        functionName: 'walletMintCount',
        args: address ? [address] : undefined,
        chainId,
        query: { enabled: enabled && Boolean(petCore && address) },
    });

    // Pyth Entropy address — public getter on GameLogic, set during initialize().
    const { data: entropyAddress } = useReadContract({
        address: gameLogic,
        abi: gameLogicAbi,
        functionName: 'entropy',
        chainId,
        query: { enabled: enabled && Boolean(gameLogic) },
    });

    // getFeeV2() returns the exact fee the contract uses (feeInWei + fee-manager
    // overhead). Reading feeInWei from getProviderInfoV2 misses the overhead by
    // 1+ wei and causes "Insufficient mint/entropy fee" reverts.
    const { data: entropyFeeRaw } = useReadContract({
        address: entropyAddress as `0x${string}` | undefined,
        abi: ENTROPY_V2_ABI,
        functionName: 'getFeeV2',
        chainId,
        query: { enabled: enabled && Boolean(entropyAddress) },
    });

    return useMemo<EvmFees>(() => {
        const base = baseMintFee as bigint | undefined;
        const mintCount = walletMintCount as bigint | undefined;
        const nextMintFee = base != null && mintCount != null ? base * (1n + mintCount) : undefined;
        return {
            baseMintFee: base,
            levelUpFee: levelUpFee as bigint | undefined,
            breedFee: breedFee as bigint | undefined,
            trainFee: trainFee as bigint | undefined,
            studFee: studFee as bigint | undefined,
            walletMintCount: mintCount,
            nextMintFee,
            entropyFee: entropyFeeRaw as bigint | undefined,
        };
    }, [baseMintFee, levelUpFee, breedFee, trainFee, studFee, walletMintCount, entropyFeeRaw]);
};
