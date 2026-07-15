import { useMemo } from 'react';
import { formatEther } from 'viem';
import { useActiveChain } from './useActiveChain';
import { useEvmFees } from './chains/ethereum/useEvmFees';
import { useSolanaFees } from './chains/solana/useSolanaFees';
import { formatLamports } from '../utils/solana/numbers';

export interface UnifiedFees {
    baseMintFee?: bigint;
    levelUpFee?: bigint;
    breedFee?: bigint;
    trainFee?: bigint;
    studFee?: bigint;
    /** Funds the settle keeper's settle transaction. On EVM this is bundled with
     *  entropyFee at requestBattle time; on Solana it's charged alone by commit_battle
     *  (no entropyFee equivalent — Switchboard VRF cost isn't collected this way). */
    battleFee?: bigint;
    /** Next mint fee for this wallet, including per-wallet escalation. */
    nextMintFee?: bigint;
    /** EVM only: Pyth Entropy fee bundled with requestMintStarter. Undefined until loaded. */
    entropyFee?: bigint;
    walletMintCount?: number;
    /** Native currency symbol for the active chain, null when disconnected. */
    symbol: 'ETH' | 'SOL' | null;
    /** Format a native-unit bigint as a numeric string only (no symbol). */
    formatAmountOnly(amount: bigint): string;
    /** Format a native-unit bigint as a full display string, e.g. "0.01 SOL". */
    formatAmount(amount: bigint): string;
}

// Stable function references — avoids re-creating functions on every render.
const ETH_AMOUNT  = (v: bigint): string => formatEther(v);
const SOL_AMOUNT  = (v: bigint): string => formatLamports(v);
const NULL_AMOUNT = (_v: bigint): string => '';

const ETH_FULL  = (v: bigint): string => `${formatEther(v)} ETH`;
const SOL_FULL  = (v: bigint): string => `${formatLamports(v)} SOL`;
const NULL_FULL = (_v: bigint): string => '';

const NULL_FEES: UnifiedFees = {
    symbol: null,
    formatAmountOnly: NULL_AMOUNT,
    formatAmount: NULL_FULL,
};

/**
 * Chain-neutral fee hook. Internally calls useEvmFees and useSolanaFees
 * (both always mounted per rules-of-hooks; the inactive one runs disabled)
 * and surfaces a single unified interface — consumers never branch on chain kind.
 */
export const useFees = (): UnifiedFees => {
    const chain = useActiveChain();
    const isEvm    = chain.kind === 'evm';
    const isSolana = chain.kind === 'solana';

    const evmFees    = useEvmFees(isEvm);
    const solanaFees = useSolanaFees(isSolana);

    return useMemo<UnifiedFees>(() => {
        if (isEvm) {
            return {
                baseMintFee:    evmFees.baseMintFee,
                levelUpFee:     evmFees.levelUpFee,
                breedFee:       evmFees.breedFee,
                trainFee:       evmFees.trainFee,
                studFee:        evmFees.studFee,
                battleFee:      evmFees.battleFee,
                nextMintFee:    evmFees.nextMintFee,
                entropyFee:     evmFees.entropyFee,
                walletMintCount: evmFees.walletMintCount != null ? Number(evmFees.walletMintCount) : undefined,
                symbol: 'ETH',
                formatAmountOnly: ETH_AMOUNT,
                formatAmount:     ETH_FULL,
            };
        }
        if (isSolana) {
            return {
                baseMintFee:    solanaFees.baseMintFeeLamports,
                levelUpFee:     solanaFees.levelUpFeeLamports,
                breedFee:       solanaFees.breedFeeLamports,
                trainFee:       solanaFees.trainFeeLamports,
                studFee:        solanaFees.studFeeLamports,
                battleFee:      solanaFees.battleFeeLamports,
                nextMintFee:    solanaFees.nextMintFeeLamports,
                walletMintCount: solanaFees.walletMintCount,
                symbol: 'SOL',
                formatAmountOnly: SOL_AMOUNT,
                formatAmount:     SOL_FULL,
            };
        }
        return NULL_FEES;
    }, [isEvm, isSolana, evmFees, solanaFees]);
};
