import { concatHex, hexToBigInt, keccak256, numberToHex, type Hex } from 'viem';

/**
 * roundSeed = keccak256(seed ‖ round), matching EVM's
 * keccak256(abi.encodePacked(uint256 seed, uint8 round)) and indexer-go's
 * rng.go roundSeed. `numberToHex(_, { size })` left-pads big-endian, matching
 * Solidity's abi.encodePacked byte layout exactly.
 *
 * viem's keccak256 is legacy Keccak-256 (Ethereum's keccak256 / Solana's
 * solana_program::keccak), NOT FIPS SHA3-256 — this is the same primitive
 * used everywhere else in this repo's chain code, not a separate choice made
 * here.
 */
export function roundSeed(seed: bigint, round: number): Hex {
    const seedHex = numberToHex(seed, { size: 32 });
    const roundHex = numberToHex(round, { size: 1 });
    return keccak256(concatHex([seedHex, roundHex]));
}

/**
 * strikeRoll = uint256(keccak256(roundSeed ‖ slotOffset)) % 10000, matching
 * EVM's keccak256(abi.encodePacked(roundSeed, slotOffset)) % 10000 and
 * indexer-go's rng.go strikeRoll (there implemented via a manual Horner-method
 * `beBytesMod` to avoid needing a bigint library; not needed here since
 * bigint is native).
 */
export function strikeRoll(rs: Hex, slotOffset: number): bigint {
    const slotHex = numberToHex(slotOffset, { size: 1 });
    const digest = keccak256(concatHex([rs, slotHex]));
    return hexToBigInt(digest) % 10000n;
}
