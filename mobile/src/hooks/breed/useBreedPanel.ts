import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    useBreedPets,
    useBreedRelationCheck,
    useChainCapabilities,
    useFees,
    useMarriageInfo,
    usePendingBreed,
    usePetList,
    type Pet,
    type PetChain,
} from '@shared/core';

import { usePetErrorToast } from '../usePetErrorToast';

const BREED_FAIL_MESSAGE = 'Failed to breed pets. Please try again.';

export type BreedTab = 'own' | 'spouse';

export type BreedablePet = { id: string; pet: Pet };

/** `hash.slice(0, 8)…`, ported from frontend's `usePetError` helper. */
const formatTxHashHint = (hash: string | undefined): string | null =>
    hash ? `${hash.slice(0, 8)}…` : null;

export interface UseBreedPanel {
    tab: BreedTab;
    onTabChange: (tab: BreedTab) => void;
    petCount: number;
    allPets: BreedablePet[];
    own: {
        pet1: string;
        pet2: string;
        childName: string;
        setPet1: (id: string) => void;
        setPet2: (id: string) => void;
        setChildName: (name: string) => void;
    };
    spouse: {
        petId: string;
        childName: string;
        setPetId: (id: string) => void;
        setChildName: (name: string) => void;
        chain: PetChain | null;
        marriageLoading: boolean;
        isMarried: boolean;
        spouseId: string | undefined;
        studFeeLabel: string | null;
    };
    areRelated: boolean;
    hasPendingBreed: boolean;
    breedButtonLabel: string;
    breedDisabled: boolean;
    onBreed: () => void;
    /** Shows the "hang tight" hint while an async (VRF) breed has not minted yet. */
    isAwaitingFulfillment: boolean;
    success: string | null;
    hashHint: string | null;
}

/**
 * Headless controller for the breed screen, ported from
 * `frontend/src/hooks/breed/useBreedPanel.ts`.
 *
 * The logic is frontend's unchanged. What differs is the return shape: frontend
 * hands back two objects typed as its own tab components' props, which would drag
 * web component types into mobile, so the same fields are regrouped as plain
 * `own` / `spouse` records.
 */
export const useBreedPanel = (): UseBreedPanel => {
    const { randomness, activeKind } = useChainCapabilities();
    const { pets, refetch } = usePetList();
    const fees = useFees();

    const [tab, setTab] = useState<BreedTab>('own');
    const [success, setSuccess] = useState<string | null>(null);
    const autoSwitched = useRef(false);

    const [ownPet1, setOwnPet1] = useState('');
    const [ownPet2, setOwnPet2] = useState('');
    const [ownChildName, setOwnChildName] = useState('');

    const [spousePetId, setSpousePetId] = useState('');
    const [spouseChildName, setSpouseChildName] = useState('');

    const allPets = useMemo(() => pets.map((pet) => ({ id: pet.id, pet })), [pets]);

    // Auto-switch to "With Spouse" when the player has fewer than 2 own pets: the
    // "My Pets" tab is unusable then, and a single pet is often a married one.
    useEffect(() => {
        if (!autoSwitched.current && pets.length > 0 && pets.length < 2) {
            autoSwitched.current = true;
            setTab('spouse');
        }
    }, [pets.length]);

    // Auto-select in the "With Spouse" tab:
    // 1. Prefer the first pet already carrying spouseId (Solana on-chain field).
    // 2. Fall back to the only pet when there is just one (EVM detects marriage
    //    lazily via useMarriageInfo after selection).
    useEffect(() => {
        if (tab === 'spouse' && !spousePetId) {
            const marriedPet = pets.find((p) => p.spouseId != null && p.spouseId !== 0);
            if (marriedPet) {
                setSpousePetId(marriedPet.id);
            } else if (pets.length === 1) {
                setSpousePetId(pets[0].id);
            }
        }
    }, [tab, pets, spousePetId]);

    const selectedSpousePet = allPets.find(({ id }) => id === spousePetId)?.pet;
    const marriageInfo = useMarriageInfo(selectedSpousePet);
    const spouseId = marriageInfo.isMarried ? marriageInfo.spouseId?.toString() : undefined;

    const studFeeLabel = useMemo(
        () => (fees.studFee == null ? null : fees.formatAmount(fees.studFee)),
        [fees],
    );

    // Relative/lineage check — EVM-only, inert (never related) on other chains.
    const relPetA = tab === 'own' ? ownPet1 : spousePetId;
    const relPetB = tab === 'own' ? ownPet2 : spouseId ?? '';
    const { areRelated } = useBreedRelationCheck(relPetA, relPetB);

    // Pending breed state is tab-specific. For cross-owner both pets are checked,
    // since the contract rejects a new request when either has one pending.
    const pendingOwn1 = usePendingBreed(tab === 'own' ? ownPet1 || undefined : undefined);
    const pendingOwn2 = usePendingBreed(tab === 'own' ? ownPet2 || undefined : undefined);
    const pendingMarried = usePendingBreed(tab === 'spouse' ? spousePetId || undefined : undefined);
    const pendingSpouse = usePendingBreed(tab === 'spouse' ? spouseId : undefined);
    const hasPendingBreed =
        tab === 'own'
            ? pendingOwn1.isPending || pendingOwn2.isPending
            : pendingMarried.isPending || pendingSpouse.isPending;

    const handleSuccess = useCallback(
        ({ name }: { name: string }) => {
            setSuccess(`"${name}" created!`);
            setOwnPet1('');
            setOwnPet2('');
            setOwnChildName('');
            setSpousePetId('');
            setSpouseChildName('');
            refetch();
        },
        [refetch],
    );

    const breed = useBreedPets({ onSuccess: handleSuccess });

    usePetErrorToast(breed.error, null, null, BREED_FAIL_MESSAGE);

    const usesSwitchboardVrf = randomness.provider === 'switchboard';
    const hashHint = usesSwitchboardVrf ? formatTxHashHint(breed.hash) : null;

    const pendingLabel = usesSwitchboardVrf ? 'Generating randomness…' : 'Submitting…';
    const breedButtonLabel = breed.isPending
        ? pendingLabel
        : breed.isAwaitingFulfillment
          ? 'Creating…'
          : tab === 'own'
            ? 'Breed Pets'
            : 'Breed with Spouse';

    const canSubmit =
        tab === 'own'
            ? Boolean(ownPet1 && ownPet2 && ownChildName.trim() && !areRelated)
            : Boolean(spousePetId && spouseId && spouseChildName.trim() && !areRelated);

    const onBreed = () => {
        breed.clearErrors();
        setSuccess(null);
        if (!canSubmit) return;

        if (tab === 'own') {
            breed.mutate({
                parentId1: ownPet1,
                parentId2: ownPet2,
                name: ownChildName.trim(),
            });
        } else if (spouseId) {
            breed.mutate({
                parentId1: spousePetId,
                parentId2: spouseId,
                name: spouseChildName.trim(),
                crossOwner: true,
            });
        }
    };

    return {
        tab,
        onTabChange: setTab,
        petCount: pets.length,
        allPets,
        own: {
            pet1: ownPet1,
            pet2: ownPet2,
            childName: ownChildName,
            setPet1: setOwnPet1,
            setPet2: setOwnPet2,
            setChildName: setOwnChildName,
        },
        spouse: {
            petId: spousePetId,
            childName: spouseChildName,
            setPetId: setSpousePetId,
            setChildName: setSpouseChildName,
            chain: activeKind,
            marriageLoading: marriageInfo.isLoading,
            isMarried: marriageInfo.isMarried,
            spouseId,
            studFeeLabel,
        },
        areRelated,
        hasPendingBreed,
        breedButtonLabel,
        breedDisabled:
            breed.isPending || breed.isAwaitingFulfillment || hasPendingBreed || !canSubmit,
        onBreed,
        isAwaitingFulfillment: breed.isAwaitingFulfillment,
        success,
        hashHint,
    };
};
