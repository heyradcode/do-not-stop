import { useQuery } from '@tanstack/react-query';
import { useSolanaAnchor } from '../../contexts/SolanaAnchorContext';
import { playerProfilePda } from '../../utils/solana/pdas';
import { useProgram } from './useProgram';

export function usePlayerProfile() {
    const { signingWallet } = useSolanaAnchor();
    const owner = signingWallet?.publicKey ?? null;
    const { program, programId, isReady } = useProgram();

    const profilePk =
        program && programId && owner ? playerProfilePda(programId, owner)[0] : null;

    return useQuery({
        queryKey: [
            'cryptopets',
            'playerProfile',
            programId?.toBase58() ?? 'none',
            owner?.toBase58() ?? 'none',
        ],
        enabled: Boolean(isReady && program && profilePk && owner),
        queryFn: async () => {
            const acc = program!.account as Record<string, { fetchNullable: (k: unknown) => Promise<unknown> }>;
            const ns = acc.playerProfile ?? acc.PlayerProfile;
            if (!ns?.fetchNullable) {
                throw new Error('IDL has no playerProfile account client');
            }
            return ns.fetchNullable(profilePk!);
        },
    });
}
