// Event handlers for the v2 stack. Pet state is always re-read from chain via
// refreshPet (src/pet.ts) rather than accumulated from event params, so the
// Pet entity is a faithful snapshot. Battle/breed use a stored request record
// to recover the participants that the settle event omits.

import {
  NewPet,
  PetLevelUp,
  PetNameChanged,
  PetTransferred,
  MarriageAccepted,
  MarriageDissolved,
} from "../generated/PetCore/PetCore";
import {
  BattleRandomnessRequested,
  BattleResolved,
  BreedRandomnessRequested,
  BreedSettled,
  Trained,
} from "../generated/GameLogic/GameLogic";
import { Battle, BattleRequest, BreedRequest } from "../generated/schema";
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

// BattleRandomnessRequested carries attacker (petId1) / defender (petId2) keyed
// by requestId; persist it so the resolve handler can recover the roles.
export function handleBattleRequested(event: BattleRandomnessRequested): void {
  const req = new BattleRequest(event.params.requestId.toString());
  req.petId1 = event.params.petId1;
  req.petId2 = event.params.petId2;
  req.save();
}

export function handleBattleResolved(event: BattleResolved): void {
  const req = BattleRequest.load(event.params.requestId.toString());

  const id =
    event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  const battle = new Battle(id);
  // attacker/defender come from the stored request; on the off chance it is
  // missing (request before startBlock), fall back to winner/loser.
  battle.attacker = req != null ? req.petId1.toString() : event.params.winnerId.toString();
  battle.defender = req != null ? req.petId2.toString() : event.params.loserId.toString();
  battle.winnerPetId = event.params.winnerId.toString();
  battle.loserPetId = event.params.loserId.toString();
  battle.seed = event.params.vrfSeed;
  battle.rounds = event.params.rounds;
  battle.winnerHpRemaining = event.params.winnerHpRemaining;
  battle.xpWin = event.params.xpWin.toI32();
  battle.xpLoss = event.params.xpLoss.toI32();
  battle.foughtAt = event.block.timestamp;
  battle.save();

  // Both pets changed (xp / level / win-loss / cooldown).
  refreshPet(event.params.winnerId, event.block.timestamp);
  refreshPet(event.params.loserId, event.block.timestamp);
}

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
