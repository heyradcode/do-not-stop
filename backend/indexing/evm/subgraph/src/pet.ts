import { Address, BigInt } from "@graphprotocol/graph-ts";
import { CryptoPets } from "../generated/CryptoPets/CryptoPets";
import { Pet } from "../generated/schema";

/** Re-read on-chain pet state via CryptoPets.getById + ownerOf. */
export function refreshPetFromChain(
  tokenId: BigInt,
  cryptoPetsAddress: Address,
  updatedAt: BigInt
): void {
  const contract = CryptoPets.bind(cryptoPetsAddress);
  const ownerResult = contract.try_ownerOf(tokenId);
  if (ownerResult.reverted) {
    return;
  }

  const dataResult = contract.try_getById(tokenId);
  if (dataResult.reverted) {
    return;
  }

  const id = tokenId.toString();
  let pet = Pet.load(id);
  if (pet == null) {
    pet = new Pet(id);
  }

  const data = dataResult.value;
  pet.owner = ownerResult.value;
  pet.name = data.name;
  pet.dna = data.dna;
  pet.level = data.level.toI32();
  pet.rarity = data.rarity;
  pet.winCount = data.winCount;
  pet.lossCount = data.lossCount;
  pet.readyAt = data.readyTime;
  pet.updatedAt = updatedAt;
  pet.save();
}
