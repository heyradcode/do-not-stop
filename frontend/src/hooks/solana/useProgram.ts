import { useConnection, useAnchorWallet, type AnchorWallet } from '@solana/wallet-adapter-react';
import { Keypair } from '@solana/web3.js';
import type { Idl } from '@coral-xyz/anchor';
import { AnchorProvider, BN, Program } from '@coral-xyz/anchor';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { getCryptopetsProgramId } from './cryptopetsConfig';

const READ_ONLY_WALLET: AnchorWallet = {
    publicKey: Keypair.generate().publicKey,
    signTransaction: async (tx) => tx,
    signAllTransactions: async (txs) => txs,
};

function toU32(n: unknown): number {
    if (BN.isBN(n)) {
        return (n as BN).toNumber();
    }
    return Number(n);
}

export type SolanaProgram = Program<Idl>;

export function useProgram() {
    const { connection } = useConnection();
    const wallet = useAnchorWallet();
    const programId = useMemo(() => getCryptopetsProgramId(), []);

    const providerWallet = wallet ?? READ_ONLY_WALLET;

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
            wallet?.publicKey?.toBase58() ?? 'read-only',
        ],
        enabled: programId !== null,
        queryFn: async (): Promise<SolanaProgram> => {
            if (!programId) {
                throw new Error('VITE_CRYPTOPETS_PROGRAM_ID is not set');
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
