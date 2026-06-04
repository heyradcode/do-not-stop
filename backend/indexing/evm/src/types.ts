import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";

/**
 * On-chain pet data returned by CryptoPets.getById().
 * Mirrors the Inventory.Pet struct in the contract.
 * If the struct changes, update the field mapping in pet.ts too.
 */
export class PetData {
  owner: Address;
  name: string;
  dna: BigInt;
  level: i32;
  rarity: i32;
  winCount: i32;
  lossCount: i32;
  readyAt: BigInt;
  updatedAt: BigInt;

  constructor(
    owner: Address,
    name: string,
    dna: BigInt,
    level: i32,
    rarity: i32,
    winCount: i32,
    lossCount: i32,
    readyAt: BigInt,
    updatedAt: BigInt
  ) {
    this.owner = owner;
    this.name = name;
    this.dna = dna;
    this.level = level;
    this.rarity = rarity;
    this.winCount = winCount;
    this.lossCount = lossCount;
    this.readyAt = readyAt;
    this.updatedAt = updatedAt;
  }
}
