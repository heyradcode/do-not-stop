import type { Pet } from '../../hooks/ethereum/usePetsContract';

/** Pet id + record, only for pets that are ready for interaction. */
export type ReadyPetOption = { id: bigint; pet: Pet };

export function getReadyPets(
    petIds: bigint[],
    pets: Pet[],
    isReady: (readyTime: bigint) => boolean
): ReadyPetOption[] {
    return petIds
        .map((id, index) => ({ id, pet: pets[index] }))
        .filter(({ pet }) => pet && isReady(pet.readyTime));
}
