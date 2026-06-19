import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useProgram } from './useProgram';
import { useSolanaAnchor } from '../../../contexts/SolanaAnchorContext';
import { breedRequestPda } from '../../../utils/solana/pdas';
import { getAccountClient } from '../../../utils/solana/accountClient';

export interface PendingSolanaBreed {
    /** True when the current wallet has an unresolved on-chain breed request. */
    isPending: boolean;
    refetch(): void;
}

/**
 * Checks whether the current Solana wallet has an open breed request PDA.
 * Recovery is automatic — breedWithSwitchboardVrf resumes on the next breed
 * attempt. This hook is used only to surface the pending state in the UI.
 */
export const usePendingSolanaBreed = (enabled = true): PendingSolanaBreed => {
    const { signingWallet } = useSolanaAnchor();
    const { program, programId, isReady } = useProgram();
    const owner = signingWallet?.publicKey;

    const query = useQuery({
        queryKey: ['cryptopets', 'breedRequest', owner?.toBase58(), programId?.toBase58()],
        enabled: enabled && isReady && Boolean(owner && program && programId),
        queryFn: async () => {
            if (!program || !programId || !owner) return null;
            const [pda] = breedRequestPda(programId, owner);
            return getAccountClient(program, 'breedRequest').fetchNullable(pda);
        },
        refetchInterval: 5_000,
    });

    const refetch = useCallback(() => { void query.refetch(); }, [query]);

    return {
        isPending: query.data != null,
        refetch,
    };
};
