export type { Attrs } from './dna';
export { digitPair, elementMod, extract, toUint16 } from './dna';
export { roundSeed, strikeRoll } from './rng';
export {
    DEFAULT_SKILL_CONFIG,
    NO_SKILL,
    SKILL_BLOODLUST,
    SKILL_CUNNING,
    SKILL_FURY,
    SKILL_REBIRTH,
    SKILL_SAGE,
    SKILL_SHELL,
    SKILL_SWIFT,
    SKILL_TANK,
    type SkillConfig,
} from './skills';
export type { StrikeOutcome } from './strike';
export { addHeal, strike } from './strike';
export { MAX_ROUNDS, simulate, type SimOutcome, type SimResult, type StrikeLogEntry } from './sim';
