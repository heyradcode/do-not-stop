import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useProgram } from './useProgram';
import { useSolanaAnchor } from '../../../contexts/SolanaAnchorContext';
import { battleRequestPda } from '../../../utils/solana/pdas';
import { getAccountClient } from '../../../utils/solana/accountClient';

export interface PendingSolanaBattle {
    /** True when the current wallet has an unresolved on-chain battle request. */
    isPending: boolean;
    refetch(): void;
}

/**
 * Checks whether the current Solana wallet has an open battle request PDA.
 * Recovery is automatic — battleWithSwitchboardVrf resumes on the next battle
 * attempt. This hook is used only to surface the pending state in the UI.
 */
export const usePendingSolanaBattle = (enabled = true): PendingSolanaBattle => {
    const { signingWallet } = useSolanaAnchor();
    const { program, programId, isReady } = useProgram();
    const owner = signingWallet?.publicKey;

    const query = useQuery({
        queryKey: ['cryptopets', 'battleRequest', owner?.toBase58(), programId?.toBase58()],
        enabled: enabled && isReady && Boolean(owner && program && programId),
        queryFn: async () => {
            if (!program || !programId || !owner) return null;
            const [pda] = battleRequestPda(programId, owner);
            return getAccountClient(program, 'battleRequest').fetchNullable(pda);
        },
        refetchInterval: 5_000,
    });

    const refetch = useCallback(() => { void query.refetch(); }, [query]);

    return {
        isPending: query.data != null,
        refetch,
    };
};
