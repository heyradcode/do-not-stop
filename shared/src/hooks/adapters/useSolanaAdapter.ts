import { useMemo } from 'react';
import { PublicKey } from '@solana/web3.js';
import { usePetActions } from '../chains/solana/usePetActions';
import { usePets as useSolanaPets } from '../chains/solana/usePets';
import { useProgram } from '../chains/solana/useProgram';
import { useSolanaAnchor } from '../../contexts/SolanaAnchorContext';
import { mapSolanaPet, type SolanaPetAccountRow } from '../../utils/pets/mapSolanaPet';
import { formatSolanaActionError } from '../../utils/solana';
import { fetchAssetByPetId, fetchMarriageOwnerSnapshot } from '../../utils/solana/accountClient';
import type { Pet } from '../../types/pet';
import type { ChainAdapter, AdapterMutation, TxLifecycle, TxPhase, ChainCapabilities } from './types';

export const SOLANA_CAPABILITIES: ChainCapabilities = {
    chainLabel: 'Solana',
    address: {
        label: 'Recipient Solana Address:',
        placeholder: 'Solana address (base58)',
        isValid: (v) => { try { new PublicKey(v); return true; } catch { return false; } },
    },
    levelUpFee: null,
    // `level_up` transfers GlobalState.level_up_fee_lamports and never reads the pet's
    // level, so the fee is flat here. Deliberately unlike EVM's quadratic curve.
    levelUpFeeFor: (baseFee) => baseFee,
    renameMinLevel: 1,
    randomness: { provider: 'switchboard', appliesTo: ['breed'] },
    explorerTxUrl: () => null,
    parseError: (err, fallback) => {
        const message = formatSolanaActionError(err, fallback);
        return { message, isUserRejection: message.toLowerCase().includes('cancelled'), isContractError: true };
    },
};

type SolanaMutation<TData = string> = {
    isPending: boolean;
    isSuccess: boolean;
    isError: boolean;
    error: Error | null;
    data: TData | undefined;
    reset: () => void;
};

const resolveHash = (data: unknown): string | undefined => {
    if (typeof data === 'string') return data;
    if (data && typeof data === 'object' && 'sig' in data && typeof (data as { sig: unknown }).sig === 'string') {
        return (data as { sig: string }).sig;
    }
    return undefined;
};

const toLc = <TData = string,>(m: SolanaMutation<TData>): TxLifecycle => {
    let phase: TxPhase = 'idle';
    if (m.isError) phase = 'error';
    else if (m.isSuccess) phase = 'success';
    else if (m.isPending) phase = 'awaiting-wallet';
    return {
        phase,
        hash: resolveHash(m.data),
        error: m.error,
        reset: m.reset,
    };
};

// toLc for the two-phase VRF flows (battle/breed): once the commit tx lands and
// we're waiting on randomness, promote 'awaiting-wallet' to 'awaiting-vrf'.
const toVrfLc = <TData = string,>(
    m: SolanaMutation<TData>,
    subPhase: 'idle' | 'awaiting-vrf',
): TxLifecycle => {
    const lc = toLc(m);
    if (subPhase === 'awaiting-vrf' && lc.phase === 'awaiting-wallet') {
        return { ...lc, phase: 'awaiting-vrf' as TxPhase };
    }
    return lc;
};

/** Infer Solana Explorer cluster param from an RPC endpoint URL. */
const clusterParam = (rpcEndpoint: string): string => {
    if (rpcEndpoint.includes('devnet')) return 'devnet';
    if (rpcEndpoint.includes('mainnet')) return 'mainnet-beta';
    if (rpcEndpoint.includes('testnet')) return 'testnet';
    return `custom&customUrl=${encodeURIComponent(rpcEndpoint)}`;
};

export const useSolanaAdapter = ({ enabled }: { enabled: boolean }): ChainAdapter => {
    const { signingWallet, connection } = useSolanaAnchor();
    const owner = enabled && signingWallet?.publicKey ? signingWallet.publicKey : null;

    const actions = usePetActions();
    const { program, programId } = useProgram();
    const petsQuery = useSolanaPets(owner);

    const solanaPets = useMemo<Pet[]>(() => {
        if (!enabled) return [];
        return ((petsQuery.data ?? []) as SolanaPetAccountRow[]).map(mapSolanaPet);
    }, [enabled, petsQuery.data]);

    const requireAssetKey = (petId: string): string => {
        const pet = solanaPets.find(p => p.id === petId);
        if (!pet?.assetKey) throw new Error(`Asset key not found for pet ${petId}`);
        return pet.assetKey;
    };

    const createPet: AdapterMutation<{ name: string }> = {
        async mutateAsync({ name }) {
            await actions.mintPet.mutateAsync({ name });
        },
        lifecycle: toLc(actions.mintPet),
        isPending: actions.mintPet.isPending,
    };

    const levelUpPet: AdapterMutation<{ petId: string }> = {
        async mutateAsync({ petId }) {
            await actions.levelUpPet.mutateAsync({ petId: Number(petId), assetKey: requireAssetKey(petId) });
        },
        lifecycle: toLc(actions.levelUpPet),
        isPending: actions.levelUpPet.isPending,
    };

    const trainPet: AdapterMutation<{ petId: string }> = {
        async mutateAsync({ petId }) {
            await actions.trainPet.mutateAsync({ petId: Number(petId), assetKey: requireAssetKey(petId) });
        },
        lifecycle: toLc(actions.trainPet),
        isPending: actions.trainPet.isPending,
    };

    const renamePet: AdapterMutation<{ petId: string; name: string }> = {
        async mutateAsync({ petId, name }) {
            await actions.renamePet.mutateAsync({ petId: Number(petId), name, assetKey: requireAssetKey(petId) });
        },
        lifecycle: toLc(actions.renamePet),
        isPending: actions.renamePet.isPending,
    };

    // `transfer_pet` CPIs mpl-core TransferV1 to move the Core asset and syncs the
    // denormalized `PetAccount.owner` so the gallery's owner-memcmp query follows the pet.
    const transferPet: AdapterMutation<{ petId: string; to: string }> = {
        async mutateAsync({ petId, to }) {
            await actions.transferPet.mutateAsync({ assetKey: requireAssetKey(petId), to });
        },
        lifecycle: toLc(actions.transferPet),
        isPending: actions.transferPet.isPending,
    };

    const breedLc = useMemo<TxLifecycle>(
        () => toVrfLc(actions.breedPets, actions.breedSubPhase),
        [actions.breedPets, actions.breedSubPhase],
    );

    const breedPets: AdapterMutation<{ parentId1: string; parentId2: string; name: string; crossOwner?: boolean }> = {
        async mutateAsync({ parentId1, parentId2, name, crossOwner }) {
            const parent1AssetKey = requireAssetKey(parentId1);
            const parent2Pet = solanaPets.find(p => p.id === parentId2);

            let parent2AssetKey = parent2Pet?.assetKey;
            let parent2Owner: string | undefined;

            if (crossOwner) {
                if (!program || !programId) throw new Error('Solana program not ready — cannot resolve spouse owner for cross-owner breed');
                // Spouse pet belongs to another wallet — look up their asset + owner on-chain.
                if (!parent2AssetKey) {
                    const assetPk = await fetchAssetByPetId(program, Number(parentId2));
                    if (!assetPk) throw new Error(`Spouse pet #${parentId2} not found on-chain`);
                    parent2AssetKey = assetPk.toBase58();
                }
                // marriageOwnerSnapshot = spouse wallet captured at accept_marriage time.
                const snapshot = await fetchMarriageOwnerSnapshot(
                    program,
                    programId,
                    new PublicKey(parent2AssetKey),
                );
                if (!snapshot) throw new Error(`Pet #${parentId2} is not married or marriage owner not found`);
                parent2Owner = snapshot.toBase58();
            }

            await actions.breedPets.mutateAsync({
                parent1Id: Number(parentId1),
                parent2Id: Number(parentId2),
                name,
                parent1AssetKey,
                parent2AssetKey,
                parent2Owner,
            });
        },
        lifecycle: breedLc,
        isPending: actions.breedPets.isPending,
    };

    const explorerTxUrl = (hash: string) =>
        `https://explorer.solana.com/tx/${hash}?cluster=${clusterParam(connection.rpcEndpoint)}`;

    return {
        kind: 'solana',
        address: signingWallet?.publicKey?.toBase58() ?? null,
        isConnected: enabled && Boolean(signingWallet?.publicKey),
        capabilities: { ...SOLANA_CAPABILITIES, explorerTxUrl },
        pets: {
            data: solanaPets,
            isLoading: petsQuery.isLoading || petsQuery.isFetching,
            error: (petsQuery.error as Error | null) ?? null,
            refetch: () => { void petsQuery.refetch(); },
        },
        createPet,
        levelUpPet,
        trainPet,
        renamePet,
        transferPet,
        breedPets,
    };
};
