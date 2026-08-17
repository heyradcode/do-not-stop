import { useCallback, useMemo, useState } from 'react';
import { getReadyPetsUnified, usePetList, type Pet, type ReadyPet } from '@shared/core';

export interface PetPicker {
    /** Pets off cooldown, after the caller's own filter. */
    selectable: ReadyPet[];
    /** Whether the wallet holds any pets at all, before cooldown or filter. */
    hasAnyPets: boolean;
    selectedId: string;
    selectedPet: Pet | null;
    select: (id: string) => void;
    clear: () => void;
    refetch: () => void;
    isLoading: boolean;
}

/**
 * Pet selection for the single-mutation screens (Level Up, Train, Rename).
 *
 * Frontend repeats this block verbatim in each of the three panels; three exact
 * copies is what makes it worth one hook here rather than a speculative one. The
 * mutation itself stays in each screen, because that is the part that differs.
 */
export const usePetPicker = (filter?: (pet: Pet) => boolean): PetPicker => {
    const { pets, isLoading, refetch } = usePetList();
    const [selectedId, setSelectedId] = useState('');

    const selectable = useMemo(() => {
        const ready = getReadyPetsUnified(pets);
        return filter ? ready.filter(({ pet }) => filter(pet)) : ready;
    }, [pets, filter]);

    const selectedPet = selectable.find(({ id }) => id === selectedId)?.pet ?? null;

    return {
        selectable,
        hasAnyPets: pets.length > 0,
        selectedId,
        selectedPet,
        select: setSelectedId,
        clear: useCallback(() => setSelectedId(''), []),
        refetch,
        isLoading,
    };
};
