import { useMemo } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { usePetsConfig } from '../../../contexts/PetsConfigContext';

export interface EvmFees {
    /** GameConfig.baseMintFee() — base gacha mint fee before per-wallet escalation. */
    baseMintFee?: bigint;
    /** GameConfig.levelUpFee() — exact value required by PetCore.levelUp. */
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
        };
    }, [baseMintFee, levelUpFee, breedFee, trainFee, studFee, walletMintCount]);
};
