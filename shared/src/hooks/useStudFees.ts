import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useProgram } from './chains/solana/useProgram';
import { useSolanaAnchor } from '../contexts/SolanaAnchorContext';
import { studFeeAccountPda } from '../utils/solana/pdas';
import { getAccountClient } from '../utils/solana/accountClient';
import { usePetActions } from './chains/solana/usePetActions';

export interface UseStudFeesResult {
    /** Withdrawable stud fee balance in lamports; null when not on Solana or not loaded. */
    amountLamports: bigint | null;
    isLoading: boolean;
    withdraw: {
        run(): Promise<void>;
        isPending: boolean;
        error: Error | null;
    };
    refetch(): void;
}

const toBigInt = (v: unknown): bigint => {
    if (typeof v === 'bigint') return v;
    try { return BigInt(String(v)); } catch { return 0n; }
};

/**
 * Reads the current wallet's StudFeeAccount balance and exposes withdraw_stud_fees.
 * Returns null balance when the account doesn't exist (not yet a stud provider).
 */
export const useStudFees = (): UseStudFeesResult => {
    const { signingWallet } = useSolanaAnchor();
    const { program, programId, isReady } = useProgram();
    const actions = usePetActions();
    const owner = signingWallet?.publicKey;

    const queryKey = ['cryptopets', 'studFeeAccount', owner?.toBase58(), programId?.toBase58()];

    const query = useQuery({
        queryKey,
        enabled: isReady && Boolean(owner && program && programId),
        queryFn: async () => {
            if (!program || !programId || !owner) return null;
            const [pda] = studFeeAccountPda(programId, owner);
            const account = await getAccountClient(program, 'studFeeAccount').fetchNullable(pda);
            if (!account) return null;
            return account as Record<string, unknown>;
        },
        refetchInterval: 15_000,
    });

    const amountLamports = query.data != null
        ? toBigInt((query.data as Record<string, unknown>).amount)
        : null;

    const refetch = useCallback(() => { void query.refetch(); }, [query]);

    return {
        amountLamports,
        isLoading: query.isLoading,
        withdraw: {
            run: async () => { await actions.withdrawStudFees.mutateAsync(); },
            isPending: actions.withdrawStudFees.isPending,
            error: actions.withdrawStudFees.error as Error | null,
        },
        refetch,
    };
};
