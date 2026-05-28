import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BN } from '@coral-xyz/anchor';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { useSolanaAnchor } from '../../../contexts/SolanaAnchorContext';
import { globalStatePda, petPda, playerProfilePda } from '../../../utils/solana/pdas';
import { battleWithSwitchboardVrf } from '../../../utils/solana/battleWithSwitchboardVrf';
import { breedWithSwitchboardVrf } from '../../../utils/solana/breedWithSwitchboardVrf';
import { getAccountClient } from '../../../utils/solana/accountClient';
import { useProgram } from './useProgram';

export function usePetActions() {
    const queryClient = useQueryClient();
    const { signingWallet } = useSolanaAnchor();
    const { program, programId, provider, toU32 } = useProgram();

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
            if (!provider) {
                throw new Error('Solana provider is not ready');
            }
            return battleWithSwitchboardVrf({
                program,
                provider,
                programId,
                owner,
                attackerPetId: args.attackerPetId,
                defenderPetId: args.defenderPetId,
            });
        },
        onSuccess: invalidateProgramQueries,
    });

    /**
     * Breed via Switchboard On-Demand VRF (commit + reveal), matching the EVM Chainlink flow.
     */
    const breedPets = useMutation({
        mutationFn: async (args: { parent1Id: number; parent2Id: number; name: string }) => {
            const { program, programId, owner } = requireReady();
            if (!provider) {
                throw new Error('Solana provider is not ready');
            }
            return breedWithSwitchboardVrf({
                program,
                provider,
                programId,
                owner,
                parent1Id: args.parent1Id,
                parent2Id: args.parent2Id,
                name: args.name,
            });
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
