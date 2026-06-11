import { Address, BigInt } from "@graphprotocol/graph-ts";
import { CryptoPets } from "../generated/CryptoPets/CryptoPets";
import { Pet } from "../generated/schema";
import { PetData } from "./types";

/** Pull on-chain state for a single pet and build a typed PetData snapshot. */
function fetchPetData(
  tokenId: BigInt,
  cryptoPetsAddress: Address,
  updatedAt: BigInt
): PetData | null {
  const contract = CryptoPets.bind(cryptoPetsAddress);

  const ownerResult = contract.try_ownerOf(tokenId);
  if (ownerResult.reverted) return null;

  const dataResult = contract.try_getById(tokenId);
  if (dataResult.reverted) return null;

  const d = dataResult.value;
  return new PetData(
    ownerResult.value,
    d.name,
    d.dna,
    d.level.toI32(),
    d.rarity,
    d.winCount,
    d.lossCount,
    d.readyTime,
    updatedAt
  );
}

/** Re-read on-chain pet state and upsert the subgraph entity. */
export function refreshPetFromChain(
  tokenId: BigInt,
  cryptoPetsAddress: Address,
  updatedAt: BigInt
): void {
  const data = fetchPetData(tokenId, cryptoPetsAddress, updatedAt);
  if (data == null) return;

  const id = tokenId.toString();
  let pet = Pet.load(id);
  if (pet == null) {
    pet = new Pet(id);
  }

  pet.owner = data.owner;
  pet.name = data.name;
  pet.dna = data.dna;
  pet.level = data.level;
  pet.rarity = data.rarity;
  pet.winCount = data.winCount;
  pet.lossCount = data.lossCount;
  pet.readyAt = data.readyAt;
  pet.updatedAt = data.updatedAt;
  pet.save();
}
