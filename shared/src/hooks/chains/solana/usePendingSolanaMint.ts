import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { useProgram } from './useProgram';
import { useSolanaAnchor } from '../../../contexts/SolanaAnchorContext';
import { globalStatePda, mintRequestPda } from '../../../utils/solana/pdas';
import { getAccountClient } from '../../../utils/solana/accountClient';

/**
 * A stuck Solana gacha mint, and the way out of it.
 *
 * The counterpart to `usePendingSolanaBreed`, and it exists for the same reason that one
 * does. `commit_mint` creates a `MintRequest` PDA seeded by the owner with `init`, so while
 * one is outstanding a second `commit_mint` cannot be sent. `mintWithSwitchboardVrf` tries to
 * resume a pending request before starting a new one, which covers the ordinary case of a
 * closed tab between commit and settle.
 *
 * What it does not cover is randomness that expired before anyone revealed it: the resume
 * path then fails at reveal every time, and the wallet cannot mint again at all. The fee is
 * already spent and `mint_count` already incremented, so the escalating fee curve has moved
 * against them too.
 *
 * `cancel_mint` is the escape hatch the program provides — permissionless, and it refunds the
 * request's rent to the owner who paid it. It does not refund the mint fee, matching
 * `cancel_breed`. Breed already surfaced this; mint did not, which left the only recovery
 * path unreachable from any client.
 */

export interface PendingSolanaMint {
    /** True when the current wallet has an unresolved on-chain mint request. */
    isPending: boolean;
    /**
     * True when the randomness has expired and `cancel_mint` will be accepted.
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
    if (v && typeof (v as { toString(): string }).toString === 'function') {
        return Number((v as { toString(): string }).toString());
    }
    return 0;
};

export const usePendingSolanaMint = (enabled = true): PendingSolanaMint => {
    const { signingWallet, connection } = useSolanaAnchor();
    const { program, programId, isReady } = useProgram();
    const owner = signingWallet?.publicKey;
    const queryClient = useQueryClient();

    const queryKey = ['cryptopets', 'mintRequest', owner?.toBase58(), programId?.toBase58()];

    const query = useQuery({
        queryKey,
        enabled: enabled && isReady && Boolean(owner && program && programId),
        queryFn: async () => {
            if (!program || !programId || !owner) return null;
            const [pda] = mintRequestPda(programId, owner);
            const request = await getAccountClient(program, 'mintRequest').fetchNullable(pda);
            if (!request) return null;

            const [gsPda] = globalStatePda(programId);
            const gs = (await getAccountClient(program, 'globalState').fetchNullable(gsPda)) as Record<
                string,
                unknown
            > | null;
            // `confirmed`, matching the breed hook: this drives a UI affordance, and the
            // program re-checks the slot itself when the cancel actually lands.
            const currentSlot = await connection.getSlot('confirmed');
            const req = request as Record<string, unknown>;
            return {
                commitSlot: toNumber(req.commitSlot),
                expirySlots: gs ? toNumber(gs.randomnessExpirySlots) : 0,
                currentSlot,
            };
        },
        refetchInterval: 5_000,
    });

    const isPending = query.data != null;
    // Strictly greater, mirroring the program's `clock.slot > commit_slot + expiry`: offering
    // the button one slot early would produce a transaction that fails as not-yet-expired.
    const canCancel =
        query.data != null ? query.data.currentSlot > query.data.commitSlot + query.data.expirySlots : false;

    const cancelMutation = useMutation({
        mutationFn: async () => {
            if (!program || !programId || !owner) throw new Error('Solana program not ready');
            const [globalState] = globalStatePda(programId);
            const [mintRequest] = mintRequestPda(programId, owner);
            await program.methods
                .cancelMint()
                .accounts({ globalState, owner, mintRequest })
                .rpc();
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey });
        },
    });

    const refetch = useCallback(() => {
        void query.refetch();
    }, [query]);

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
