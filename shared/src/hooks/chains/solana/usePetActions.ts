import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { useSolanaAnchor } from '../../../contexts/SolanaAnchorContext';
import {
    feeVaultPda,
    globalStatePda,
    petPdaByAsset,
} from '../../../utils/solana/pdas';
import { battleWithSwitchboardVrf, type BattleVrfResult } from '../../../utils/solana/battleWithSwitchboardVrf';
import { breedWithSwitchboardVrf } from '../../../utils/solana/breedWithSwitchboardVrf';
import { mintWithSwitchboardVrf } from '../../../utils/solana/mintWithSwitchboardVrf';
import { useProgram } from './useProgram';

export const usePetActions = () => {
    const queryClient = useQueryClient();
    const { signingWallet } = useSolanaAnchor();
    const { program, programId, provider } = useProgram();

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

    /**
     * Battle the signer's pet (attacker) against any pet. When `defenderOwner` is
     * omitted it defaults to the signer (same-wallet battle); pass a foreign owner
     * pubkey for PvP against another player's pet.
     */
    const battlePets = useMutation<BattleVrfResult, Error, {
        attackerPetId: number;
        defenderPetId: number;
        attackerAssetKey: string;
        defenderOwner?: string;
    }>({
        mutationFn: async (args) => {
            const { program, programId, owner } = requireReady();
            if (!provider) throw new Error('Solana provider is not ready');
            return battleWithSwitchboardVrf({
                program,
                provider,
                programId,
                owner,
                attackerPetId: args.attackerPetId,
                defenderPetId: args.defenderPetId,
                attackerAssetKey: args.attackerAssetKey,
                ...(args.defenderOwner
                    ? { defenderOwner: new PublicKey(args.defenderOwner) }
                    : {}),
            });
        },
        onSuccess: invalidateProgramQueries,
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
            return breedWithSwitchboardVrf({
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
            });
        },
        onSuccess: invalidateProgramQueries,
    });

    return {
        mintPet,
        levelUpPet,
        trainPet,
        renamePet,
        battlePets,
        breedPets,
        walletPublicKey: signingWallet?.publicKey ?? null,
        walletConnected: Boolean(signingWallet?.publicKey),
    };
}
