import { PublicKey } from '@solana/web3.js';
import type { Idl } from '@coral-xyz/anchor';
import { AnchorProvider, Program } from '@coral-xyz/anchor';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { SolanaSigningWallet } from '../../../contexts/SolanaAnchorContext';
import { useSolanaAnchor } from '../../../contexts/SolanaAnchorContext';
/** Stand-in wallet for read-only paths — never signs, so an all-zero pubkey is sufficient. */
const READ_ONLY_WALLET: SolanaSigningWallet = {
    publicKey: PublicKey.default,
    signTransaction: async (tx) => tx,
    signAllTransactions: async (txs) => txs,
};

export type SolanaProgram = Program<Idl>;

export const useProgram = () => {
    const { connection, programId, signingWallet } = useSolanaAnchor();

    const providerWallet = signingWallet ?? READ_ONLY_WALLET;

    const provider = useMemo(
        () =>
            new AnchorProvider(connection, providerWallet, {
                commitment: 'confirmed',
                preflightCommitment: 'confirmed',
            }),
        [connection, providerWallet]
    );

    // IDL is a global program artifact — it never changes per wallet.
    // Keyed only on (endpoint, programId) so we fetch it exactly once and
    // re-use across wallet connections, eliminating the re-fetch delay each
    // time a wallet is connected or switched.
    const idlQuery = useQuery({
        queryKey: ['cryptopets', 'idl', connection.rpcEndpoint, programId?.toBase58() ?? 'none'],
        enabled: programId !== null,
        staleTime: Infinity,
        queryFn: async (): Promise<Idl> => {
            if (!programId) {
                throw new Error('Solana program id is not configured');
            }
            // Pass the program id — Anchor's fetchIdl derives the on-chain IDL PDA itself.
            // (Do NOT pass the derived IDL account address; it would derive a PDA-of-a-PDA.)
            const idl = await Program.fetchIdl(programId, provider);
            if (!idl) {
                throw new Error(
                    'IDL not found on-chain for this program. Deploy the IDL (`anchor idl init`) or point RPC at a cluster where it exists.'
                );
            }
            return idl;
        },
    });

    // Program is rebuilt from the cached IDL whenever the provider changes
    // (wallet connect/disconnect/switch). No extra network request.
    const program = useMemo<SolanaProgram | null>(() => {
        if (!idlQuery.data) return null;
        return new Program(idlQuery.data, provider) as SolanaProgram;
    }, [idlQuery.data, provider]);

    return {
        programId,
        program,
        provider: signingWallet ? provider : null,
        isConfigured: programId !== null,
        isLoading: idlQuery.isPending,
        isFetching: idlQuery.isFetching,
        error: idlQuery.error,
        refetch: idlQuery.refetch,
        isReady: Boolean(programId && program),
    };
}
