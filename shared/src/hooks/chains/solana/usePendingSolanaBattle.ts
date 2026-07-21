import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SystemProgram } from '@solana/web3.js';
import { useProgram } from './useProgram';
import { useSolanaAnchor } from '../../../contexts/SolanaAnchorContext';
import { battleRequestPda, feeVaultPda, globalStatePda } from '../../../utils/solana/pdas';
import { getAccountClient } from '../../../utils/solana/accountClient';

export interface PendingSolanaBattle {
    /** True when the current wallet has an unresolved on-chain battle request. */
    isPending: boolean;
    /**
     * True when the randomness has expired and cancel_battle can be called.
     * Always false until the slot data has loaded.
     */
    canCancel: boolean;
    cancel: {
        run(): Promise<void>;
        isPending: boolean;
        error: Error | null;
    };
    refetch(): void;
}

const toNumber = (v: unknown): number => {
    if (typeof v === 'number') return v;
    if (typeof v === 'bigint') return Number(v);
    if (v && typeof (v as { toString(): string }).toString === 'function') return Number((v as { toString(): string }).toString());
    return 0;
};

export const usePendingSolanaBattle = (enabled = true): PendingSolanaBattle => {
    const { signingWallet, connection } = useSolanaAnchor();
    const { program, programId, isReady } = useProgram();
    const owner = signingWallet?.publicKey;
    const queryClient = useQueryClient();

    const queryKey = ['cryptopets', 'battleRequest', owner?.toBase58(), programId?.toBase58()];

    const query = useQuery({
        queryKey,
        enabled: enabled && isReady && Boolean(owner && program && programId),
        queryFn: async () => {
            if (!program || !programId || !owner) return null;
            const [pda] = battleRequestPda(programId, owner);
            const request = await getAccountClient(program, 'battleRequest').fetchNullable(pda);
            if (!request) return null;
            const [gsPda] = globalStatePda(programId);
            const gs = await getAccountClient(program, 'globalState').fetchNullable(gsPda) as Record<string, unknown> | null;
            const currentSlot = await connection.getSlot('confirmed');
            const req = request as Record<string, unknown>;
            const commitSlot = toNumber(req.commitSlot);
            const expirySlots = gs ? toNumber(gs.randomnessExpirySlots) : 0;
            return { request: req, commitSlot, expirySlots, currentSlot };
        },
        refetchInterval: 5_000,
    });

    const isPending = query.data != null;
    const canCancel = isPending && query.data != null
        ? query.data.currentSlot > query.data.commitSlot + query.data.expirySlots
        : false;

    const cancelMutation = useMutation({
        mutationFn: async () => {
            if (!program || !programId || !owner) throw new Error('Solana program not ready');
            const [globalState] = globalStatePda(programId);
            const [battleRequest] = battleRequestPda(programId, owner);
            const [feeVault] = feeVaultPda(programId);
            await program.methods
                .cancelBattle()
                .accounts({
                    globalState,
                    attackerOwner: owner,
                    battleRequest,
                    feeVault,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey });
        },
    });

    const refetch = useCallback(() => { void query.refetch(); }, [query]);

    return {
        isPending,
        canCancel,
        cancel: {
            run: cancelMutation.mutateAsync,
            isPending: cancelMutation.isPending,
            error: cancelMutation.error as Error | null,
        },
        refetch,
    };
};
