import { BigInt } from "@graphprotocol/graph-ts";
import { PetCoreV1 } from "../generated/PetCoreV1/PetCoreV1";
import { Pet } from "../generated/schema";
import { PETCORE_ADDRESS } from "./addresses";

// refreshPet re-reads a pet's full on-chain state from PetCoreV1 and upserts
// the Pet entity. Every pet-touching handler funnels through here, so the
// entity is always a faithful snapshot rather than a hand-maintained
// accumulation. updatedAt (the block timestamp) is the per-pet version
// indexer-go resumes from. A reverted read (e.g. a not-yet-minted id) is
// skipped rather than written as garbage.
export function refreshPet(petId: BigInt, updatedAt: BigInt): void {
  const core = PetCoreV1.bind(PETCORE_ADDRESS);

  const ownerRes = core.try_ownerOf(petId);
  if (ownerRes.reverted) return;
  const petRes = core.try_getPet(petId);
  if (petRes.reverted) return;
  const p = petRes.value;

  const id = petId.toString();
  let pet = Pet.load(id);
  if (pet == null) {
    pet = new Pet(id);
  }

  pet.owner = ownerRes.value;
  pet.name = p.name;
  pet.dna = p.dna;
  pet.level = p.level.toI32();
  pet.rarity = p.rarity;
  pet.winCount = p.winCount;
  pet.lossCount = p.lossCount;
  pet.readyAt = p.readyTime;
  pet.updatedAt = updatedAt;

  // v2 fields.
  pet.xp = p.xp.toI32();
  pet.generation = p.generation;
  pet.parent1Id = p.parent1Id;
  pet.parent2Id = p.parent2Id;
  pet.breedCount = p.breedCount;
  pet.speciesId = p.speciesId;
  pet.breedReadyAt = p.breedReadyAt;
  pet.trainReadyAt = p.trainReadyAt;

  // Marriage spouse lives in a separate mapping, not the Pet struct.
  const marriage = core.try_marriageOf(petId);
  if (!marriage.reverted) {
    pet.spouseId = marriage.value.getSpouseId();
  } else {
    pet.spouseId = BigInt.zero();
  }

  pet.save();
}
