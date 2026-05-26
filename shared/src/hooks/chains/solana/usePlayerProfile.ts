import { useQuery } from '@tanstack/react-query';
import { useSolanaAnchor } from '../../../contexts/SolanaAnchorContext';
import { playerProfilePda } from '../../../utils/solana/pdas';
import { getAccountClient } from '../../../utils/solana/accountClient';
import { useProgram } from './useProgram';

export function usePlayerProfile() {
    const { signingWallet } = useSolanaAnchor();
    const owner = signingWallet?.publicKey ?? null;
    const { program, programId, isReady } = useProgram();

    const profilePk = program && programId && owner ? playerProfilePda(programId, owner)[0] : null;

    return useQuery({
        queryKey: [
            'cryptopets',
            'playerProfile',
            programId?.toBase58() ?? 'none',
            owner?.toBase58() ?? 'none',
        ],
        enabled: Boolean(isReady && program && profilePk && owner),
        queryFn: () => getAccountClient(program!, 'playerProfile').fetchNullable(profilePk!),
    });
}
