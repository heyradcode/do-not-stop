/**
 * Minimal CryptoPets ABI — only the read functions the indexer needs.
 * Mirrors `contracts/ethereum/src/CryptoPets.sol` + `Inventory.Pet`.
 */
export const CRYPTOPETS_ABI = [
    'function getTotalCount() view returns (uint256)',
    'function ownerOf(uint256 tokenId) view returns (address)',
    'function getById(uint256 tokenId) view returns (tuple(string name, uint256 dna, uint32 level, uint32 readyTime, uint16 winCount, uint16 lossCount, uint8 rarity))',
] as const;

/** Shape returned by `getById` (named tuple). */
export interface EvmPetStruct {
    name: string;
    dna: bigint;
    level: bigint;
    readyTime: bigint;
    winCount: bigint;
    lossCount: bigint;
    rarity: bigint;
}

/** Typed view over the ethers Contract for the functions above. */
export interface CryptoPetsReader {
    getTotalCount(): Promise<bigint>;
    ownerOf(tokenId: bigint): Promise<string>;
    getById(tokenId: bigint): Promise<EvmPetStruct>;
}
