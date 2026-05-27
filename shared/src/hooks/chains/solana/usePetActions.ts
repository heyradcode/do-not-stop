import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BN } from '@coral-xyz/anchor';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { useSolanaAnchor } from '../../../contexts/SolanaAnchorContext';
import { globalStatePda, petPda, playerProfilePda } from '../../../utils/solana/pdas';
import { getAccountClient } from '../../../utils/solana/accountClient';
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

    const transferPet = useMutation({
        mutationFn: async (args: { petId: number; to: string }) => {
            const { program, programId, owner } = requireReady();
            const toOwner = new PublicKey(args.to);
            const [globalState] = globalStatePda(programId);
            const [fromPlayerProfile] = playerProfilePda(programId, owner);
            const [fromPet] = petPda(programId, owner, args.petId);
            const [toPlayerProfile] = playerProfilePda(programId, toOwner);
            const [toPet] = petPda(programId, toOwner, args.petId);

            return program.methods
                .transferPet()
                .accounts({
                    globalState,
                    fromPlayerProfile,
                    fromPet,
                    toOwner,
                    toPlayerProfile,
                    toPet,
                    fromOwner: owner,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();
        },
        onSuccess: invalidateProgramQueries,
    });

    /**
     * Same-owner battle: signer fights two of their own pets (matches the existing UI which
     * only picks from the connected wallet's pets). Cross-owner battle would require an
     * additional `defenderOwner` arg here and a UI affordance for picking foreign pets.
     */
    const battlePets = useMutation({
        mutationFn: async (args: { attackerPetId: number; defenderPetId: number }) => {
            const { program, programId, owner } = requireReady();
            const [globalState] = globalStatePda(programId);
            const [attackerPet] = petPda(programId, owner, args.attackerPetId);
            const [defenderPet] = petPda(programId, owner, args.defenderPetId);

            return program.methods
                .battle()
                .accounts({
                    globalState,
                    attackerOwner: owner,
                    attackerPet,
                    defenderOwner: owner,
                    defenderPet,
                })
                .rpc();
        },
        onSuccess: invalidateProgramQueries,
    });

    /**
     * Breed two of the signer's pets into a new child PDA. Solana lacks native VRF, so the
     * program mixes parent DNAs with `Clock`-derived entropy synchronously — no two-step
     * VRF dance like the EVM flow.
     */
    const breedPets = useMutation({
        mutationFn: async (args: { parent1Id: number; parent2Id: number; name: string }) => {
            const { program, programId, owner } = requireReady();
            const [globalState] = globalStatePda(programId);
            const [playerProfile] = playerProfilePda(programId, owner);
            const [parent1] = petPda(programId, owner, args.parent1Id);
            const [parent2] = petPda(programId, owner, args.parent2Id);

            const gs = (await getAccountClient(program, 'globalState').fetch(globalState)) as {
                nextPetId?: unknown;
            };
            const nextPetId = toU32(gs.nextPetId);
            const [child] = petPda(programId, owner, nextPetId);

            return program.methods
                .breed(args.name)
                .accounts({
                    globalState,
                    owner,
                    playerProfile,
                    parent1,
                    parent2,
                    child,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();
        },
        onSuccess: invalidateProgramQueries,
    });

    return {
        createStarterPet,
        levelUpPet,
        renamePet,
        transferPet,
        battlePets,
        breedPets,
        walletPublicKey: signingWallet?.publicKey ?? null,
        walletConnected: Boolean(signingWallet?.publicKey),
    };
}
