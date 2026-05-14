import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAnchorWallet } from '@solana/wallet-adapter-react';
import { BN } from '@coral-xyz/anchor';
import { SystemProgram } from '@solana/web3.js';
import { useProgram } from './useProgram';
import { globalStatePda, petPda, playerProfilePda } from './pdas';

export function usePetActions() {
    const queryClient = useQueryClient();
    const wallet = useAnchorWallet();
    const { program, programId, toU32 } = useProgram();

    const invalidateProgramQueries = () => queryClient.invalidateQueries({ queryKey: ['cryptopets'] });

    const createStarterPet = useMutation({
        mutationFn: async (args: { name: string; dna: bigint | number | string; rarity: number }) => {
            if (!program || !programId || !wallet?.publicKey) {
                throw new Error('Connect a Solana wallet first');
            }
            const [globalState] = globalStatePda(programId);
            const [playerProfile] = playerProfilePda(programId, wallet.publicKey);

            const acc = program.account as Record<string, { fetch: (k: unknown) => Promise<{ nextPetId?: unknown }> }>;
            const gsClient = acc.globalState ?? acc.GlobalState;
            if (!gsClient?.fetch) {
                throw new Error('IDL has no globalState account client');
            }
            const gs = await gsClient.fetch(globalState);
            const nextPetId = toU32(gs.nextPetId);
            const [pet] = petPda(programId, wallet.publicKey, nextPetId);

            return program.methods
                .createStarterPet(args.name, new BN(args.dna.toString()), args.rarity)
                .accounts({
                    globalState,
                    playerProfile,
                    pet,
                    owner: wallet.publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();
        },
        onSuccess: invalidateProgramQueries,
    });

    const levelUpPet = useMutation({
        mutationFn: async (args: { petId: number }) => {
            if (!program || !programId || !wallet?.publicKey) {
                throw new Error('Connect a Solana wallet first');
            }
            const [globalState] = globalStatePda(programId);
            const [pet] = petPda(programId, wallet.publicKey, args.petId);

            return program.methods
                .levelUp()
                .accounts({
                    globalState,
                    pet,
                    owner: wallet.publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();
        },
        onSuccess: invalidateProgramQueries,
    });

    const renamePet = useMutation({
        mutationFn: async (args: { petId: number; name: string }) => {
            if (!program || !programId || !wallet?.publicKey) {
                throw new Error('Connect a Solana wallet first');
            }
            const [globalState] = globalStatePda(programId);
            const [pet] = petPda(programId, wallet.publicKey, args.petId);

            return program.methods
                .renamePet(args.name)
                .accounts({
                    globalState,
                    pet,
                    owner: wallet.publicKey,
                })
                .rpc();
        },
        onSuccess: invalidateProgramQueries,
    });

    return {
        createStarterPet,
        levelUpPet,
        renamePet,
        walletPublicKey: wallet?.publicKey ?? null,
        walletConnected: Boolean(wallet?.publicKey),
    };
}
