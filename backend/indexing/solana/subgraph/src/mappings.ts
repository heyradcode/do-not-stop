import { Pets } from "../generated/cryptopets_solana/CryptoPetsSolana";
import { Pet } from "../generated/schema";

export function handlePets(pets: Pets): void {
  for (let i = 0; i < pets.pets.length; i++) {
    const row = pets.pets[i];
    const id = row.id;
    let pet = Pet.load(id);
    if (pet == null) {
      pet = new Pet(id);
    }

    pet.owner = row.owner as Uint8Array;
    pet.name = row.name;
    pet.dna = row.dna;
    pet.level = row.level;
    pet.rarity = row.rarity;
    pet.winCount = row.winCount;
    pet.lossCount = row.lossCount;
    pet.readyAt = row.readyAt;
    pet.updatedAt = row.updatedAt;
    pet.save();
  }
}
