import type { Pet } from '../../types/pet';
import { isPetReadyAt } from './cosmetics';

export type ReadyPet = { id: string; pet: Pet };

/** Chain-agnostic filter for pets whose cooldown has elapsed. */
export function getReadyPets(pets: Pet[]): ReadyPet[] {
    return pets
        .filter((pet) => isPetReadyAt(pet.readyAt))
        .map((pet) => ({ id: pet.id, pet }));
}
