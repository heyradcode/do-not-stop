import { Keypair } from '@solana/web3.js';
import type { Idl } from '@coral-xyz/anchor';
import { AnchorProvider, Program } from '@coral-xyz/anchor';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { SolanaSigningWallet } from '../../contexts/SolanaAnchorContext';
import { useSolanaAnchor } from '../../contexts/SolanaAnchorContext';
import { toU32 } from '../../utils/solana/numbers';

const READ_ONLY_WALLET: SolanaSigningWallet = {
    publicKey: Keypair.generate().publicKey,
    signTransaction: async (tx) => tx,
    signAllTransactions: async (txs) => txs,
};

export type SolanaProgram = Program<Idl>;

export function useProgram() {
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

    const query = useQuery({
        queryKey: [
            'cryptopets',
            'program',
            connection.rpcEndpoint,
            programId?.toBase58() ?? 'none',
            signingWallet?.publicKey?.toBase58() ?? 'read-only',
        ],
        enabled: programId !== null,
        queryFn: async (): Promise<SolanaProgram> => {
            if (!programId) {
                throw new Error('Solana program id is not configured');
            }
            const idl = await Program.fetchIdl(programId, provider);
            if (!idl) {
                throw new Error(
                    'IDL not found on-chain for this program. Deploy the IDL (`anchor idl init`) or point RPC at a cluster where it exists.'
                );
            }
            return new Program(idl, provider) as SolanaProgram;
        },
    });

    return {
        programId,
        program: query.data ?? null,
        provider,
        isConfigured: programId !== null,
        isLoading: query.isPending,
        isFetching: query.isFetching,
        error: query.error,
        refetch: query.refetch,
        isReady: Boolean(programId && query.data),
        toU32,
    };
}
