import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BN } from '@coral-xyz/anchor';
import { SystemProgram } from '@solana/web3.js';
import { useSolanaAnchor } from '../../contexts/SolanaAnchorContext';
import { globalStatePda, petPda, playerProfilePda } from '../../utils/solana/pdas';
import { getAccountClient } from '../../utils/solana/accountClient';
import { useProgram } from './useProgram';

export function usePetActions() {
    const queryClient = useQueryClient();
    const { signingWallet } = useSolanaAnchor();
    const { program, programId, toU32 } = useProgram();

    const invalidateProgramQueries = () => queryClient.invalidateQueries({ queryKey: ['cryptopets'] });

    const requireReady = () => {
        if (!signingWallet?.publicKey) {
            throw new Error('Connect a Solana wallet first');
        }
        if (!programId) {
            throw new Error('Solana program id is not configured');
        }
        if (!program) {
            throw new Error('Solana program is still loading. Try again in a moment.');
        }
        return { program, programId, owner: signingWallet.publicKey };
    };

    const createStarterPet = useMutation({
        mutationFn: async (args: { name: string; dna: bigint | number | string; rarity: number }) => {
            const { program, programId, owner } = requireReady();
            const [globalState] = globalStatePda(programId);
            const [playerProfile] = playerProfilePda(programId, owner);

            const gs = (await getAccountClient(program, 'globalState').fetch(globalState)) as {
                nextPetId?: unknown;
            };
            const nextPetId = toU32(gs.nextPetId);
            const [pet] = petPda(programId, owner, nextPetId);

            return program.methods
                .createStarterPet(args.name, new BN(args.dna.toString()), args.rarity)
                .accounts({
                    globalState,
                    playerProfile,
                    pet,
                    owner,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();
        },
        onSuccess: invalidateProgramQueries,
    });

    const levelUpPet = useMutation({
        mutationFn: async (args: { petId: number }) => {
            const { program, programId, owner } = requireReady();
            const [globalState] = globalStatePda(programId);
            const [pet] = petPda(programId, owner, args.petId);

            return program.methods
                .levelUp()
                .accounts({
                    globalState,
                    pet,
                    owner,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();
        },
        onSuccess: invalidateProgramQueries,
    });

    const renamePet = useMutation({
        mutationFn: async (args: { petId: number; name: string }) => {
            const { program, programId, owner } = requireReady();
            const [globalState] = globalStatePda(programId);
            const [pet] = petPda(programId, owner, args.petId);

            return program.methods
                .renamePet(args.name)
                .accounts({
                    globalState,
                    pet,
                    owner,
                })
                .rpc();
        },
        onSuccess: invalidateProgramQueries,
    });

    return {
        createStarterPet,
        levelUpPet,
        renamePet,
        walletPublicKey: signingWallet?.publicKey ?? null,
        walletConnected: Boolean(signingWallet?.publicKey),
    };
}
