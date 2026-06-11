import {
  NewPet as NewPetEvent,
  PetLevelUp as PetLevelUpEvent,
  PetNameChanged as PetNameChangedEvent,
} from "../generated/Inventory/Inventory";
import { CRYPTOPETS_ADDRESS } from "./addresses";
import { refreshPetFromChain } from "./pet";

export function handleNewPet(event: NewPetEvent): void {
  refreshPetFromChain(
    event.params.petId,
    CRYPTOPETS_ADDRESS,
    event.block.timestamp
  );
}

export function handlePetLevelUp(event: PetLevelUpEvent): void {
  refreshPetFromChain(
    event.params.petId,
    CRYPTOPETS_ADDRESS,
    event.block.timestamp
  );
}

export function handlePetNameChanged(event: PetNameChangedEvent): void {
  refreshPetFromChain(
    event.params.petId,
    CRYPTOPETS_ADDRESS,
    event.block.timestamp
  );
}
