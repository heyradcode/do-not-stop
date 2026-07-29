import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { useSolanaAnchor } from '../../../contexts/SolanaAnchorContext';
import {
    feeVaultPda,
    globalStatePda,
    petPdaByAsset,
    studFeeAccountPda,
} from '../../../utils/solana/pdas';
import { breedWithSwitchboardVrf } from '../../../utils/solana/breedWithSwitchboardVrf';
import { mintWithSwitchboardVrf } from '../../../utils/solana/mintWithSwitchboardVrf';
import { getAccountClient } from '../../../utils/solana/accountClient';
import { MPL_CORE_PROGRAM_ID } from '../../../utils/solana/constants';
import { useProgram } from './useProgram';

export const usePetActions = () => {
    const queryClient = useQueryClient();
    const { signingWallet } = useSolanaAnchor();
    const { program, programId, provider } = useProgram();

    const [breedSubPhase, setBreedSubPhase] = useState<'idle' | 'awaiting-vrf'>('idle');

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

    /** Gacha mint: two-phase VRF flow (commit → reveal). DNA/rarity are randomised at settle. */
    const mintPet = useMutation({
        mutationFn: async (args: { name: string }) => {
            const { program, programId, owner } = requireReady();
            if (!provider) throw new Error('Solana provider is not ready');
            return mintWithSwitchboardVrf({ program, provider, programId, owner, name: args.name });
        },
        onSuccess: invalidateProgramQueries,
    });

    const levelUpPet = useMutation({
        mutationFn: async (args: { petId: number; assetKey: string }) => {
            const { program, programId, owner } = requireReady();
            const [globalState] = globalStatePda(programId);
            const petAsset = new PublicKey(args.assetKey);
            const [pet] = petPdaByAsset(programId, args.assetKey);
            const [feeVault] = feeVaultPda(programId);

            return program.methods
                .levelUp()
                .accounts({
                    globalState,
                    petAsset,
                    pet,
                    feeVault,
                    owner,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();
        },
        onSuccess: invalidateProgramQueries,
    });

    const trainPet = useMutation({
        mutationFn: async (args: { petId: number; assetKey: string }) => {
            const { program, programId, owner } = requireReady();
            const [globalState] = globalStatePda(programId);
            const petAsset = new PublicKey(args.assetKey);
            const [pet] = petPdaByAsset(programId, args.assetKey);
            const [feeVault] = feeVaultPda(programId);

            return program.methods
                .train()
                .accounts({
                    globalState,
                    petAsset,
                    pet,
                    feeVault,
                    owner,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();
        },
        onSuccess: invalidateProgramQueries,
    });

    const renamePet = useMutation({
        mutationFn: async (args: { petId: number; name: string; assetKey: string }) => {
            const { program, programId, owner } = requireReady();
            const [globalState] = globalStatePda(programId);
            const petAsset = new PublicKey(args.assetKey);
            const [pet] = petPdaByAsset(programId, args.assetKey);

            return program.methods
                .renamePet(args.name)
                .accounts({
                    globalState,
                    petAsset,
                    pet,
                    owner,
                })
                .rpc();
        },
        onSuccess: invalidateProgramQueries,
    });

    const transferPet = useMutation({
        mutationFn: async (args: { assetKey: string; to: string }) => {
            const { program, programId, owner } = requireReady();
            const petAsset = new PublicKey(args.assetKey);
            const [pet] = petPdaByAsset(programId, args.assetKey);
            const [globalState] = globalStatePda(programId);
            const gs = (await getAccountClient(program, 'globalState').fetch(globalState)) as { collection: unknown };
            const collection = gs.collection instanceof PublicKey
                ? gs.collection
                : new PublicKey(String((gs.collection as { toBase58(): string }).toBase58?.() ?? gs.collection));
            return program.methods
                .transferPet()
                .accounts({
                    globalState,
                    petAsset,
                    pet,
                    collection,
                    newOwner: new PublicKey(args.to),
                    owner,
                    mplCoreProgram: new PublicKey(MPL_CORE_PROGRAM_ID),
                    systemProgram: SystemProgram.programId,
                })
                .rpc();
        },
        onSuccess: invalidateProgramQueries,
    });

    const withdrawStudFees = useMutation({
        mutationFn: async () => {
            const { program, programId, owner } = requireReady();
            const [studFeeAccount] = studFeeAccountPda(programId, owner);
            return program.methods
                .withdrawStudFees()
                .accounts({ owner, studFeeAccount })
                .rpc();
        },
        onSuccess: invalidateProgramQueries,
    });

    const syncMetadata = useMutation({
        mutationFn: async (args: { assetKey: string }) => {
            const { program, programId, owner } = requireReady();
            const petAsset = new PublicKey(args.assetKey);
            const [pet] = petPdaByAsset(programId, args.assetKey);
            const [globalState] = globalStatePda(programId);
            const gs = (await getAccountClient(program, 'globalState').fetch(globalState)) as { collection: unknown };
            const collection = gs.collection instanceof PublicKey
                ? gs.collection
                : new PublicKey(String((gs.collection as { toBase58(): string }).toBase58?.() ?? gs.collection));
            return program.methods
                .syncMetadata()
                .accounts({
                    globalState,
                    asset: petAsset,
                    pet,
                    mplCoreProgram: new PublicKey(MPL_CORE_PROGRAM_ID),
                    collection,
                    payer: owner,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();
        },
    });

    /**
     * Breed via Switchboard On-Demand VRF (commit + reveal), matching the EVM Chainlink flow.
     * For cross-owner breeding, pass `parent2AssetKey` and `parent2Owner`; for same-wallet
     * breeding both can be omitted (parent2AssetKey is looked up on-chain).
     */
    const breedPets = useMutation({
        mutationFn: async (args: {
            parent1Id: number;
            parent2Id: number;
            name: string;
            parent1AssetKey: string;
            parent2AssetKey?: string;
            parent2Owner?: string;
        }) => {
            const { program, programId, owner } = requireReady();
            if (!provider) throw new Error('Solana provider is not ready');
            setBreedSubPhase('idle');
            try {
                return await breedWithSwitchboardVrf({
                    program,
                    provider,
                    programId,
                    owner,
                    parent1Id: args.parent1Id,
                    parent2Id: args.parent2Id,
                    name: args.name,
                    parent1AssetKey: args.parent1AssetKey,
                    parent2AssetKey: args.parent2AssetKey,
                    ...(args.parent2Owner
                        ? { parent2Owner: new PublicKey(args.parent2Owner) }
                        : {}),
                    onCommitted: () => setBreedSubPhase('awaiting-vrf'),
                });
            } finally {
                setBreedSubPhase('idle');
            }
        },
        onSuccess: invalidateProgramQueries,
    });

    return {
        mintPet,
        levelUpPet,
        trainPet,
        renamePet,
        transferPet,
        withdrawStudFees,
        syncMetadata,
        breedPets,
        breedSubPhase,
        walletPublicKey: signingWallet?.publicKey ?? null,
        walletConnected: Boolean(signingWallet?.publicKey),
    };
};
