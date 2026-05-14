import { useQuery } from '@tanstack/react-query';
import { useAnchorWallet } from '@solana/wallet-adapter-react';
import { useProgram } from './useProgram';
import { playerProfilePda } from './pdas';

export function usePlayerProfile() {
    const wallet = useAnchorWallet();
    const owner = wallet?.publicKey ?? null;
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
