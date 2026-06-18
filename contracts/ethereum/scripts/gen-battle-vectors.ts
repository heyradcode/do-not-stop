import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { network } from "hardhat";

// Generates contracts/test-vectors/battle.json by running CombatSim.simulate
// against a curated set of inputs (plan §7 cross-chain golden vectors). The
// output file is the source of truth for Hardhat, Anchor, and indexer-go tests
// — re-run this script (`pnpm hh run scripts/gen-battle-vectors.ts`) whenever
// CombatSim / combat.rs intentionally change.

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Matches GameConfig's default skill balance (plan §3.7), mirrored by
// combat::SkillConfig::default() on Solana.
const SKILL_CONFIG = {
    tankHpMult: 120,
    shellDefMult: 125,
    swiftCritBonus: 50,
    cunningCritCap: 4000,
    furyDmgMult: 130,
    furyHpThreshold: 3000,
    sageMdefMult: 125,
    bloodlustBps: 150,
};

// Sentinel: matches none of the 0-7 skill archetype branches (mirrors
// combat::NO_SKILL = 8 on Solana; EVM tests commonly use 99).
const NO_SKILL = 99;

const SEED_MAX = (1n << 256n) - 1n;

const dnaA = 1234567890123456n; // pair0=56 -> element 56%6=2
const dnaB = 9876543210987654n; // pair0=54 -> element 54%6=0
const dnaC = 1111111111111111n; // pair0=11 -> element 11%6=5
const dnaE = 1234567890123412n; // pair0=12 -> element 12%6=0 ("next" of dnaC's element 5)

interface VectorCase {
    name: string;
    dna1: bigint;
    rarity1: number;
    level1: number;
    skill1: number;
    dna2: bigint;
    rarity2: number;
    level2: number;
    skill2: number;
    seed: bigint;
}

const cases: VectorCase[] = [
    { name: "baseline-no-skill",     dna1: dnaA, rarity1: 1, level1: 20,  skill1: NO_SKILL, dna2: dnaB, rarity2: 1, level2: 20, skill2: NO_SKILL, seed: 1n },
    { name: "seed-zero",             dna1: dnaA, rarity1: 1, level1: 20,  skill1: NO_SKILL, dna2: dnaB, rarity2: 1, level2: 20, skill2: NO_SKILL, seed: 0n },
    { name: "seed-max",              dna1: dnaA, rarity1: 1, level1: 20,  skill1: NO_SKILL, dna2: dnaB, rarity2: 1, level2: 20, skill2: NO_SKILL, seed: SEED_MAX },
    { name: "tank-skill",            dna1: dnaA, rarity1: 1, level1: 20,  skill1: 0,        dna2: dnaB, rarity2: 1, level2: 20, skill2: NO_SKILL, seed: 2n },
    { name: "shell-skill",           dna1: dnaA, rarity1: 1, level1: 20,  skill1: 1,        dna2: dnaB, rarity2: 1, level2: 20, skill2: NO_SKILL, seed: 3n },
    { name: "swift-skill",           dna1: dnaA, rarity1: 1, level1: 20,  skill1: 2,        dna2: dnaB, rarity2: 1, level2: 20, skill2: NO_SKILL, seed: 4n },
    { name: "cunning-skill",         dna1: dnaA, rarity1: 1, level1: 20,  skill1: 3,        dna2: dnaB, rarity2: 1, level2: 20, skill2: NO_SKILL, seed: 5n },
    { name: "fury-skill",            dna1: dnaA, rarity1: 1, level1: 20,  skill1: 4,        dna2: dnaB, rarity2: 1, level2: 20, skill2: NO_SKILL, seed: 6n },
    { name: "sage-skill",            dna1: dnaA, rarity1: 1, level1: 20,  skill1: 5,        dna2: dnaB, rarity2: 1, level2: 20, skill2: NO_SKILL, seed: 7n },
    { name: "rebirth-skill",         dna1: dnaA, rarity1: 1, level1: 20,  skill1: 6,        dna2: dnaB, rarity2: 1, level2: 20, skill2: NO_SKILL, seed: 8n },
    { name: "bloodlust-skill",       dna1: dnaA, rarity1: 1, level1: 20,  skill1: 7,        dna2: dnaB, rarity2: 1, level2: 20, skill2: NO_SKILL, seed: 9n },
    { name: "level-gap-max",         dna1: dnaA, rarity1: 5, level1: 100, skill1: NO_SKILL, dna2: dnaB, rarity2: 1, level2: 1,  skill2: NO_SKILL, seed: 10n },
    { name: "element-wheel-next",    dna1: dnaC, rarity1: 1, level1: 20,  skill1: NO_SKILL, dna2: dnaE, rarity2: 1, level2: 20, skill2: NO_SKILL, seed: 11n },
    { name: "mirror-tie",            dna1: dnaA, rarity1: 1, level1: 20,  skill1: NO_SKILL, dna2: dnaA, rarity2: 1, level2: 20, skill2: NO_SKILL, seed: 12n },
];

async function main() {
    const { viem } = await network.connect();
    const combatSim = await viem.deployContract("CombatSim");

    const vectors = [];
    for (const c of cases) {
        const result = await combatSim.read.simulate([
            c.dna1, c.rarity1, c.level1, c.skill1,
            c.dna2, c.rarity2, c.level2, c.skill2,
            c.seed, SKILL_CONFIG,
        ]);
        vectors.push({
            name: c.name,
            dna1: c.dna1.toString(),
            rarity1: c.rarity1,
            level1: c.level1,
            skill1: c.skill1,
            dna2: c.dna2.toString(),
            rarity2: c.rarity2,
            level2: c.level2,
            skill2: c.skill2,
            seed: c.seed.toString(),
            expected: {
                firstWins: result.firstWins,
                rounds: Number(result.rounds),
                winnerHpRemaining: Number(result.winnerHpRemaining),
            },
        });
    }

    const out = {
        description: "CombatSim.simulate golden vectors (plan §7). NO_SKILL = 99 (any value outside 0-7).",
        skillConfig: SKILL_CONFIG,
        cases: vectors,
    };

    const outPath = path.resolve(__dirname, "../../test-vectors/battle.json");
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
    console.log(`Wrote ${vectors.length} vectors to ${outPath}`);
}

await main();
