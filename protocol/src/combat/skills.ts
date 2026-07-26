/** Skill archetype indices (= speciesId % 8, plan §3.7). Mirrors
 *  indexer-go's skills.go / CombatSim.sol's inline constants. */
export const SKILL_TANK = 0;
export const SKILL_SHELL = 1;
export const SKILL_SWIFT = 2;
export const SKILL_CUNNING = 3;
export const SKILL_FURY = 4;
export const SKILL_SAGE = 5;
export const SKILL_REBIRTH = 6;
export const SKILL_BLOODLUST = 7;
/** Opts a pet out of every archetype branch (any value outside 0-7). Matches
 *  NO_SKILL=99 in battle.json and the Solidity/Rust/Go sentinel convention —
 *  any value works as long as it isn't 0-7; 99 is just what the vectors use. */
export const NO_SKILL = 99;

/** Tunable skill balance values (plan §3.7), mirroring GameConfig.SkillConfig
 *  on both chains / indexer-go's SkillConfig. Sourced from GameConfig on
 *  chain, never hardcoded client-side — see CombatSim.sol's header comment
 *  for what each field does. */
export interface SkillConfig {
    tankHpMult: number; // x/100, e.g. 120 = +20% HP
    shellDefMult: number; // x/100, e.g. 125 = +25% DEF
    swiftCritBonus: number; // bps added to crit base, e.g. 50 = +0.5%
    cunningCritCap: number; // bps cap, e.g. 4000 = 40%
    furyDmgMult: number; // x/100 when triggered, e.g. 130 = +30%
    furyHpThreshold: number; // bps of startHP to trigger, e.g. 3000 = 30%
    sageMdefMult: number; // x/100, e.g. 125 = +25% MDEF
    bloodlustBps: number; // bps of physical dmg healed, e.g. 150 = 15%
}

/** Matches GameConfig.sol's initializers — the values contracts/test-vectors/
 *  battle.json's cases assume unless a vector supplies its own skillConfig. */
export const DEFAULT_SKILL_CONFIG: SkillConfig = {
    tankHpMult: 120,
    shellDefMult: 125,
    swiftCritBonus: 50,
    cunningCritCap: 4000,
    furyDmgMult: 130,
    furyHpThreshold: 3000,
    sageMdefMult: 125,
    bloodlustBps: 150,
};
