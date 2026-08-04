/**
 * TypeScript port of the fight-relevant half of indexer-go's combat package
 * (dna.go), itself a port of contracts/ethereum/src/DnaLib.sol / combat.rs
 * (Solana). Only what CombatSim.simulate needs is ported here — species
 * resolution (dna.go's resolveSpecies) happens at mint time in PetCore, not
 * inside the battle sim, so it's out of scope for this port.
 *
 * Every function here is pure bigint math, bit-identical to the Solidity /
 * Rust / Go implementations — cross-chain (and now cross-runtime) parity is
 * enforced by the golden vectors in contracts/test-vectors/battle.json (see
 * protocol/tests/combat/goldenVectors.test.ts). If a vector fails, this
 * port is wrong; fix the TS, never the vector.
 */

/** Level-scaled, rarity-multiplied battle attributes derived from a pet's DNA
 *  (plan §3.1). Mirrors DnaLib.Attrs (Solidity) / dna::Attrs (Rust) /
 *  indexer-go's Attrs (Go). All fields are bigint: DNA is a 16-digit number
 *  that exceeds Number.MAX_SAFE_INTEGER, so this module never uses `number`
 *  for anything that participates in the sim's arithmetic. */
export interface Attrs {
    hp: bigint;
    atk: bigint;
    def: bigint;
    int: bigint; // magic attack + initiative + crits
    mdef: bigint;
    element: bigint; // 0-5
}

const UINT16_MOD = 65536n;

/** Truncates to the low 16 bits, matching Solidity's `uint16(...)` cast /
 *  Go's `uint16(...)` conversion (wraparound, not a clamp). Never actually
 *  wraps for realistic pet stats (level <= 100, rarity 1-5) — kept for exact
 *  parity with the reference implementations regardless. */
export function toUint16(x: bigint): bigint {
    return x % UINT16_MOD;
}

/** digitPair returns the two-digit value at pairIdx (0-indexed, LSB-first):
 *  (dna / 100^pairIdx) % 100. */
export function digitPair(dna: bigint, pairIdx: number): bigint {
    const div = 100n ** BigInt(pairIdx);
    return (dna / div) % 100n;
}

/** Derives level-scaled, rarity-multiplied battle attributes from dna (plan
 *  §3.1). Mirrors DnaLib.extract / dna::extract / indexer-go's Extract. */
export function extract(dna: bigint, rarity: number, level: number): Attrs {
    const elem = digitPair(dna, 0) % 6n;
    const hpGene = digitPair(dna, 1);
    const atkGene = digitPair(dna, 2);
    const defGene = digitPair(dna, 3);
    const intGene = digitPair(dna, 4);
    const mdefGene = digitPair(dna, 5);

    const r = BigInt(Math.max(rarity, 1));
    const mul = 100n + (r - 1n) * 5n;
    const lv = BigInt(level);

    return {
        hp: toUint16(((100n + 4n * hpGene + 6n * lv) * mul) / 100n),
        atk: toUint16(((10n + atkGene + 2n * lv) * mul) / 100n),
        def: toUint16(((10n + defGene + 2n * lv) * mul) / 100n),
        int: toUint16(((10n + intGene + 2n * lv) * mul) / 100n),
        mdef: toUint16(((10n + mdefGene + 2n * lv) * mul) / 100n),
        element: elem,
    };
}

/** Element-advantage multiplier (out of 100) for a strike from attacker onto
 *  defender on the six-element wheel (plan §3.2): 115 (advantage), 85
 *  (disadvantage), or 100 (neutral/same). */
export function elementMod(attacker: bigint, defender: bigint): bigint {
    if (attacker === defender) return 100n;
    if (defender === (attacker + 1n) % 6n) return 115n; // attacker hits its next -> advantage
    if (attacker === (defender + 1n) % 6n) return 85n; // defender is attacker's next -> disadvantage
    return 100n; // non-adjacent in the 6-cycle -> neutral
}
