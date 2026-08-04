// Event handlers for the v2 stack. Pet state is always re-read from chain via
// refreshPet (src/pet.ts) rather than accumulated from event params, so the
// Pet entity is a faithful snapshot. Breeding uses a stored request record to
// recover the parents that BreedSettled omits.
//
// No battle handlers: battles are resolved by the backend and published as signed
// receipts (docs/plan-backend-battle-architecture.md), never as chain events.

import {
  NewPet,
  PetLevelUp,
  PetNameChanged,
  PetTransferred,
  MarriageAccepted,
  MarriageDissolved,
} from "../generated/PetCore/PetCore";
import {
  BreedRandomnessRequested,
  BreedSettled,
  Trained,
} from "../generated/GameLogic/GameLogic";
import { BreedRequest } from "../generated/schema";
import { refreshPet } from "./pet";

// ─── PetCore ───────────────────────────────────────────────────────────────

export function handleNewPet(event: NewPet): void {
  refreshPet(event.params.petId, event.block.timestamp);
}

export function handlePetLevelUp(event: PetLevelUp): void {
  refreshPet(event.params.petId, event.block.timestamp);
}

export function handlePetNameChanged(event: PetNameChanged): void {
  refreshPet(event.params.petId, event.block.timestamp);
}

export function handlePetTransferred(event: PetTransferred): void {
  refreshPet(event.params.tokenId, event.block.timestamp);
}

export function handleMarriageAccepted(event: MarriageAccepted): void {
  refreshPet(event.params.petIdA, event.block.timestamp);
  refreshPet(event.params.petIdB, event.block.timestamp);
}

export function handleMarriageDissolved(event: MarriageDissolved): void {
  refreshPet(event.params.petIdA, event.block.timestamp);
  refreshPet(event.params.petIdB, event.block.timestamp);
}

// ─── GameLogic ─────────────────────────────────────────────────────────────

export function handleBreedRequested(event: BreedRandomnessRequested): void {
  const req = new BreedRequest(event.params.requestId.toString());
  req.petId1 = event.params.petId1;
  req.petId2 = event.params.petId2;
  req.save();
}

export function handleBreedSettled(event: BreedSettled): void {
  // The newborn always changed; the parents' breedCount/cooldown did too, but
  // BreedSettled omits them — recover from the stored request.
  refreshPet(event.params.childId, event.block.timestamp);

  const req = BreedRequest.load(event.params.requestId.toString());
  if (req != null) {
    refreshPet(req.petId1, event.block.timestamp);
    refreshPet(req.petId2, event.block.timestamp);
  }
}

export function handleTrained(event: Trained): void {
  refreshPet(event.params.petId, event.block.timestamp);
}
