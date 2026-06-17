import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { useSolanaAnchor } from '../../../contexts/SolanaAnchorContext';
import { globalStatePda, petPdaByAsset, marriageProposalPda } from '../../../utils/solana/pdas';
import { fetchAssetByPetId, getAccountClient } from '../../../utils/solana/accountClient';
import { useProgram } from './useProgram';

/** Fetch the MarriageProposal account for petAId. Returns proposer pubkey or null if no live proposal. */
const fetchProposalProposer = async (
    program: SolanaProgram,
    programId: PublicKey,
    petAId: number,
): Promise<PublicKey | null> => {
    const [proposalPda] = marriageProposalPda(programId, petAId);
    try {
        const account = await getAccountClient(program, 'marriageProposal').fetchNullable(proposalPda);
        if (!account) return null;
        const { proposer } = account as { proposer?: unknown };
        if (!proposer || typeof proposer !== 'object') return null;
        return proposer as PublicKey;
    } catch {
        return null;
    }
};

export type SolanaMarriageAction<TArgs> = {
    mutateAsync(args: TArgs): Promise<void>;
    isPending: boolean;
    error: Error | null;
    reset(): void;
};

export const useSolanaMarriage = () => {
    const queryClient = useQueryClient();
    const { signingWallet } = useSolanaAnchor();
    const { program, programId } = useProgram();

    const invalidate = () => queryClient.invalidateQueries({ queryKey: ['cryptopets'] });

    const requireReady = () => {
        if (!signingWallet?.publicKey) throw new Error('Connect a Solana wallet first');
        if (!program || !programId) throw new Error('Solana program not ready');
        return { program, programId, owner: signingWallet.publicKey };
    };

    const propose = useMutation({
        mutationFn: async (args: { petIdA: string; petIdB: string; assetKeyA: string }) => {
            const { program, programId, owner } = requireReady();
            const [globalState] = globalStatePda(programId);
            const petAAsset = new PublicKey(args.assetKeyA);
            const [petA] = petPdaByAsset(programId, args.assetKeyA);
            const petAId = parseInt(args.petIdA);
            const [marriageProposal] = marriageProposalPda(programId, petAId);

            const petBId = parseInt(args.petIdB);
            const petBAsset = await fetchAssetByPetId(program, petBId);
            if (!petBAsset) throw new Error(`Pet #${args.petIdB} not found on-chain`);
            const [petB] = petPdaByAsset(programId, petBAsset.toBase58());

            return program.methods
                .proposeMarriage()
                .accounts({
                    globalState,
                    owner,
                    petAAsset,
                    petA,
                    petBAsset,
                    petB,
                    marriageProposal,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();
        },
        onSuccess: invalidate,
    });

    const accept = useMutation({
        mutationFn: async (args: { petIdA: string; petIdB: string; assetKeyB: string }) => {
            const { program, programId, owner } = requireReady();
            const [globalState] = globalStatePda(programId);

            const petAId = parseInt(args.petIdA);
            const petAAsset = await fetchAssetByPetId(program, petAId);
            if (!petAAsset) throw new Error(`Pet #${args.petIdA} not found on-chain`);
            const [petA] = petPdaByAsset(programId, petAAsset.toBase58());
            const [marriageProposal] = marriageProposalPda(programId, petAId);

            const petAOwner = await fetchProposalProposer(program, programId, petAId);
            if (!petAOwner) throw new Error(`No active proposal from pet #${args.petIdA}`);

            const petBAsset = new PublicKey(args.assetKeyB);
            const [petB] = petPdaByAsset(programId, args.assetKeyB);

            return program.methods
                .acceptMarriage()
                .accounts({
                    globalState,
                    owner,
                    petAAsset,
                    petAOwner,
                    petA,
                    petBAsset,
                    petB,
                    marriageProposal,
                })
                .rpc();
        },
        onSuccess: invalidate,
    });

    const cancel = useMutation({
        mutationFn: async (args: { petIdA: string }) => {
            const { program, programId, owner } = requireReady();
            const [globalState] = globalStatePda(programId);
            const petAId = parseInt(args.petIdA);
            const [marriageProposal] = marriageProposalPda(programId, petAId);

            return program.methods
                .cancelMarriageProposal(petAId)
                .accounts({ globalState, owner, marriageProposal })
                .rpc();
        },
        onSuccess: invalidate,
    });

    const divorce = useMutation({
        mutationFn: async (args: { petId: string; assetKey: string; spouseId: number }) => {
            const { program, programId, owner } = requireReady();
            const [globalState] = globalStatePda(programId);
            const petAsset = new PublicKey(args.assetKey);
            const [pet] = petPdaByAsset(programId, args.assetKey);
            const spouseAsset = await fetchAssetByPetId(program, args.spouseId);
            if (!spouseAsset) throw new Error(`Spouse pet #${args.spouseId} not found on-chain`);
            const [spouse] = petPdaByAsset(programId, spouseAsset.toBase58());

            return program.methods
                .divorce()
                .accounts({ globalState, owner, petAsset, pet, spouseAsset, spouse })
                .rpc();
        },
        onSuccess: invalidate,
    });

    const toAction = <TArgs,>(m: typeof propose): SolanaMarriageAction<TArgs> => ({
        mutateAsync: m.mutateAsync as unknown as (args: TArgs) => Promise<void>,
        isPending: m.isPending,
        error: m.error as Error | null,
        reset: m.reset,
    });

    return {
        propose: toAction<{ petIdA: string; petIdB: string; assetKeyA: string }>(propose),
        accept: toAction<{ petIdA: string; petIdB: string; assetKeyB: string }>(accept),
        cancel: toAction<{ petIdA: string }>(cancel),
        divorce: toAction<{ petId: string; assetKey: string; spouseId: number }>(divorce),
        canWrite: Boolean(signingWallet?.publicKey && program && programId),
    };
};
