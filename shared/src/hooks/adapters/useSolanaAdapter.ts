import { useMemo } from 'react';
import { PublicKey } from '@solana/web3.js';
import { usePetActions } from '../chains/solana/usePetActions';
import { usePets as useSolanaPets } from '../chains/solana/usePets';
import { useSolanaAnchor } from '../../contexts/SolanaAnchorContext';
import { mapSolanaPet, type SolanaPetAccountRow } from '../../utils/pets/mapSolanaPet';
import type { Pet } from '../../types/pet';
import type { ChainAdapter, AdapterMutation, TxLifecycle, TxPhase, ChainCapabilities } from './types';

const SOLANA_CAPABILITIES: ChainCapabilities = {
    chainLabel: 'Solana',
    address: {
        label: 'Recipient Solana Address:',
        placeholder: 'Solana address (base58)',
        isValid: (v) => { try { new PublicKey(v); return true; } catch { return false; } },
    },
    levelUpFee: null,
    renameMinLevel: 1,
    randomness: { provider: 'switchboard', appliesTo: ['battle', 'breed'] },
    explorerTxUrl: () => null,
};

type SolanaMutation<TData = string> = {
    isPending: boolean;
    isSuccess: boolean;
    isError: boolean;
    error: Error | null;
    data: TData | undefined;
    reset: () => void;
};

function toLc<TData = string>(m: SolanaMutation<TData>): TxLifecycle {
    let phase: TxPhase = 'idle';
    if (m.isError) phase = 'error';
    else if (m.isSuccess) phase = 'success';
    else if (m.isPending) phase = 'awaiting-wallet';
    return {
        phase,
        hash: typeof m.data === 'string' ? m.data : undefined,
        error: m.error,
        reset: m.reset,
    };
}

export function useSolanaAdapter({ enabled }: { enabled: boolean }): ChainAdapter {
    const { signingWallet } = useSolanaAnchor();
    const owner = enabled && signingWallet?.publicKey ? signingWallet.publicKey : null;

    const actions = usePetActions();
    const petsQuery = useSolanaPets(owner);

    const solanaPets = useMemo<Pet[]>(() => {
        if (!enabled) return [];
        return ((petsQuery.data ?? []) as SolanaPetAccountRow[]).map(mapSolanaPet);
    }, [enabled, petsQuery.data]);

    const createPet: AdapterMutation<{ name: string; dna?: bigint | number | string; rarity?: number }> = {
        async mutateAsync({ name, dna, rarity }) {
            await actions.createStarterPet.mutateAsync({ name, dna: dna ?? 0n, rarity: rarity ?? 1 });
        },
        lifecycle: toLc(actions.createStarterPet),
        isPending: actions.createStarterPet.isPending,
    };

    const levelUpPet: AdapterMutation<{ petId: string }> = {
        async mutateAsync({ petId }) {
            await actions.levelUpPet.mutateAsync({ petId: Number(petId) });
        },
        lifecycle: toLc(actions.levelUpPet),
        isPending: actions.levelUpPet.isPending,
    };

    const renamePet: AdapterMutation<{ petId: string; name: string }> = {
        async mutateAsync({ petId, name }) {
            await actions.renamePet.mutateAsync({ petId: Number(petId), name });
        },
        lifecycle: toLc(actions.renamePet),
        isPending: actions.renamePet.isPending,
    };

    const transferPet: AdapterMutation<{ petId: string; to: string }> = {
        async mutateAsync({ petId, to }) {
            await actions.transferPet.mutateAsync({ petId: Number(petId), to });
        },
        lifecycle: toLc(actions.transferPet),
        isPending: actions.transferPet.isPending,
    };

    const battlePets: AdapterMutation<{ petId1: string; petId2: string; defenderOwner?: string }> = {
        async mutateAsync({ petId1, petId2, defenderOwner }) {
            await actions.battlePets.mutateAsync({
                attackerPetId: Number(petId1),
                defenderPetId: Number(petId2),
                ...(defenderOwner ? { defenderOwner } : {}),
            });
        },
        lifecycle: toLc(actions.battlePets),
        isPending: actions.battlePets.isPending,
    };

    const breedPets: AdapterMutation<{ parentId1: string; parentId2: string; name: string }> = {
        async mutateAsync({ parentId1, parentId2, name }) {
            await actions.breedPets.mutateAsync({
                parent1Id: Number(parentId1),
                parent2Id: Number(parentId2),
                name,
            });
        },
        lifecycle: toLc(actions.breedPets),
        isPending: actions.breedPets.isPending,
    };

    return {
        kind: 'solana',
        address: signingWallet?.publicKey?.toBase58() ?? null,
        isConnected: enabled && Boolean(signingWallet?.publicKey),
        capabilities: SOLANA_CAPABILITIES,
        pets: {
            data: solanaPets,
            isLoading: petsQuery.isLoading || petsQuery.isFetching,
            error: (petsQuery.error as Error | null) ?? null,
            refetch: () => { void petsQuery.refetch(); },
        },
        createPet,
        levelUpPet,
        renamePet,
        transferPet,
        battlePets,
        breedPets,
    };
}
