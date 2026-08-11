import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useChainCapabilities, useCreatePet, usePetList, type Pet } from '@shared/core';

import type { RootStackParamList } from '../../navigation/routes';
import { useNotifyError } from '../useNotifyError';
import { usePetCooldowns, type PetCooldownStatus } from '../usePetCooldowns';

/**
 * Headless controller for the gallery, ported from
 * `frontend/src/hooks/pet-gallery/usePetGallery.ts`. The view is a pure function of
 * this hook, same convention as frontend.
 *
 * Two differences. Navigation is React Navigation rather than `useNavigate`, and
 * targets the per-pet stack routes decided in plan 3.1 instead of a sidebar path.
 * And `useCreatePet` lives here rather than in the screen, so the mint's `onSuccess`
 * can refetch the list the hook already owns.
 *
 * Transfer lives here too. The pet being sent is held rather than a boolean, so
 * the sheet always knows which one it has, and `onSent` refetches because a
 * transferred pet has left this wallet and the list it came from is now wrong.
 */
export interface UsePetGallery {
    pets: Pet[];
    isLoading: boolean;
    error: Error | null;
    totalWins: number;
    statusFor: (pet: Pet) => PetCooldownStatus;
    refreshing: boolean;
    onRefresh: () => void;
    createPet: ReturnType<typeof useCreatePet>;
    createModalOpen: boolean;
    onOpenCreateModal: () => void;
    onCloseCreateModal: () => void;
    onBattle: (pet: Pet) => void;
    onRename: (pet: Pet) => void;
    onDefend: (pet: Pet) => void;
    /** The pet being transferred, or null when the send sheet is closed. */
    sendingPet: Pet | null;
    onSend: (pet: Pet) => void;
    onCloseSend: () => void;
    onSent: () => void;
}

type GalleryNavigation = NativeStackNavigationProp<RootStackParamList>;

export const usePetGallery = (): UsePetGallery => {
    const navigation = useNavigation<GalleryNavigation>();
    const { isConnected } = useChainCapabilities();
    const { pets, isLoading, error, refetch } = usePetList();
    const notifyError = useNotifyError();
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    // Held as the pet rather than a boolean: the sheet needs to know which one it
    // is sending, and a stale id after a refetch would send the wrong pet.
    const [sendingPet, setSendingPet] = useState<Pet | null>(null);

    const { statusFor } = usePetCooldowns(pets);

    const totalWins = useMemo(
        () => pets.reduce((sum, pet) => sum + (pet.winCount ?? 0), 0),
        [pets],
    );

    useEffect(() => {
        if (!error) return;
        notifyError('Failed to load pet data. Please try again.', error, 'pet-list');
    }, [error, notifyError]);

    const onCloseCreateModal = useCallback(() => setCreateModalOpen(false), []);

    // EVM minting is two-phase (requestMintStarter, then settleMint once Pyth
    // Entropy reveals), so the list is only worth re-reading once onSuccess fires.
    const createPet = useCreatePet({
        onSuccess: () => {
            onCloseCreateModal();
            refetch();
        },
    });

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        try {
            await refetch();
        } catch {
            // Swallowed on purpose. A failed refetch already reaches the player
            // through the `error` effect above, and `RefreshControl` discards
            // whatever this returns, so rethrowing only buys an unhandled
            // rejection.
        } finally {
            setRefreshing(false);
        }
    }, [refetch]);

    return {
        pets: isConnected ? pets : [],
        isLoading,
        error,
        totalWins,
        statusFor,
        refreshing,
        onRefresh,
        createPet,
        createModalOpen,
        onOpenCreateModal: () => setCreateModalOpen(true),
        onCloseCreateModal,
        onBattle: (pet) => navigation.navigate('Main', { screen: 'Battle', params: { petId: pet.id } }),
        onRename: (pet) => navigation.navigate('Rename', { petId: pet.id }),
        onDefend: (pet) => navigation.navigate('Defense', { petId: pet.id }),
        onEquip: (pet) => navigation.navigate('Equip', { petId: pet.id }),
        sendingPet,
        onSend: setSendingPet,
        onCloseSend: () => setSendingPet(null),
        // The pet has left this wallet, so the list it was read from is now wrong.
        onSent: refetch,
    };
};
