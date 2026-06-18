import { useMemo } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { usePetsConfig } from '../../../contexts/PetsConfigContext';

// getFeeV2() on the real Pyth Entropy fails via eth_call (staticcall) — it's not fully
// staticcall-compatible despite being declared view. Instead we read feeInWei directly
// from the ProviderInfo struct, which is a plain storage read and always works.
const ENTROPY_V2_ABI = [
    {
        inputs: [],
        name: 'getDefaultProvider',
        outputs: [{ internalType: 'address', name: 'provider', type: 'address' }],
        stateMutability: 'view',
        type: 'function' as const,
    },
    {
        inputs: [{ internalType: 'address', name: 'provider', type: 'address' }],
        name: 'getProviderInfoV2',
        outputs: [{
            components: [
                { internalType: 'uint128', name: 'feeInWei', type: 'uint128' },
                { internalType: 'uint128', name: 'accruedFeesInWei', type: 'uint128' },
                { internalType: 'bytes32', name: 'originalCommitment', type: 'bytes32' },
                { internalType: 'uint64', name: 'originalCommitmentSequenceNumber', type: 'uint64' },
                { internalType: 'bytes', name: 'commitmentMetadata', type: 'bytes' },
                { internalType: 'bytes', name: 'uri', type: 'bytes' },
                { internalType: 'uint64', name: 'endSequenceNumber', type: 'uint64' },
                { internalType: 'uint64', name: 'sequenceNumber', type: 'uint64' },
                { internalType: 'bytes32', name: 'currentCommitment', type: 'bytes32' },
                { internalType: 'uint64', name: 'currentCommitmentSequenceNumber', type: 'uint64' },
                { internalType: 'address', name: 'feeManager', type: 'address' },
                { internalType: 'uint32', name: 'maxNumHashes', type: 'uint32' },
                { internalType: 'uint32', name: 'defaultGasLimit', type: 'uint32' },
            ],
            internalType: 'struct EntropyStructsV2.ProviderInfo',
            name: 'info',
            type: 'tuple',
        }],
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

    const gameConfig = evm?.gameConfig?.address;
    const gameConfigAbi = useMemo(() => evm?.gameConfig?.abi ?? [], [evm?.gameConfig?.abi]);
    const petCore = evm?.petCore.address;
    const petCoreAbi = useMemo(() => evm?.petCore.abi ?? [], [evm?.petCore.abi]);
    const gameLogic = evm?.gameLogic?.address;
    const gameLogicAbi = useMemo(() => evm?.gameLogic?.abi ?? [], [evm?.gameLogic?.abi]);

    const cfgQuery = { enabled: enabled && Boolean(gameConfig) };
    const { data: baseMintFee } = useReadContract({ address: gameConfig, abi: gameConfigAbi, functionName: 'baseMintFee', query: cfgQuery });
    const { data: levelUpFee } = useReadContract({ address: gameConfig, abi: gameConfigAbi, functionName: 'levelUpFee', query: cfgQuery });
    const { data: breedFee } = useReadContract({ address: gameConfig, abi: gameConfigAbi, functionName: 'breedFee', query: cfgQuery });
    const { data: trainFee } = useReadContract({ address: gameConfig, abi: gameConfigAbi, functionName: 'trainFee', query: cfgQuery });
    const { data: studFee } = useReadContract({ address: gameConfig, abi: gameConfigAbi, functionName: 'studFee', query: cfgQuery });

    const { data: walletMintCount } = useReadContract({
        address: petCore,
        abi: petCoreAbi,
        functionName: 'walletMintCount',
        args: address ? [address] : undefined,
        query: { enabled: enabled && Boolean(petCore && address) },
    });

    // Pyth Entropy address — public getter on GameLogic, set during initialize().
    const { data: entropyAddress, isError: entropyAddrErr } = useReadContract({
        address: gameLogic,
        abi: gameLogicAbi,
        functionName: 'entropy',
        query: { enabled: enabled && Boolean(gameLogic) },
    });

    // getFeeV2() on the live Pyth contract fails via eth_call, so we read feeInWei
    // directly: getDefaultProvider() → getProviderInfoV2(provider) → .feeInWei
    const { data: defaultProvider, isError: defaultProviderErr } = useReadContract({
        address: entropyAddress as `0x${string}` | undefined,
        abi: ENTROPY_V2_ABI,
        functionName: 'getDefaultProvider',
        query: { enabled: enabled && Boolean(entropyAddress) },
    });

    const { data: providerInfo, isError: providerInfoErr } = useReadContract({
        address: entropyAddress as `0x${string}` | undefined,
        abi: ENTROPY_V2_ABI,
        functionName: 'getProviderInfoV2',
        args: defaultProvider ? [defaultProvider as `0x${string}`] : undefined,
        query: { enabled: enabled && Boolean(entropyAddress && defaultProvider) },
    });

    if (enabled) {
        console.log('[fees]', {
            gameLogic,
            entropyAddress: entropyAddress ?? (entropyAddrErr ? 'ERR' : 'loading'),
            defaultProvider: defaultProvider ?? (defaultProviderErr ? 'ERR' : 'loading'),
            feeInWei: (providerInfo as { feeInWei?: bigint } | undefined)?.feeInWei ?? (providerInfoErr ? 'ERR' : 'loading'),
        });
    }

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
            entropyFee: (providerInfo as { feeInWei?: bigint } | undefined)?.feeInWei,
        };
    }, [baseMintFee, levelUpFee, breedFee, trainFee, studFee, walletMintCount, providerInfo]);
};
