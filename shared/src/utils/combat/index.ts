/**
 * Compatibility re-export. The combat engine moved to `@cryptopets/protocol`
 * (`protocol/src/combat/`) so the standalone receipt verifier can replay fights
 * under an MIT license — see that package's README for why. Existing
 * `shared/src/utils/combat` imports in frontend, mobile, and backend keep
 * working unchanged.
 *
 * New code should import from `@cryptopets/protocol` directly.
 */
export type {
    Attrs,
    SimOutcome,
    SimOutcomeWire,
    SimResult,
    SkillConfig,
    StrikeLogEntry,
    StrikeLogEntryWire,
    StrikeOutcome,
} from '@cryptopets/protocol';
export {
    addHeal,
    DEFAULT_SKILL_CONFIG,
    decodeSimOutcome,
    digitPair,
    elementMod,
    encodeSimOutcome,
    extract,
    MAX_ROUNDS,
    NO_SKILL,
    roundSeed,
    simulate,
    SKILL_BLOODLUST,
    SKILL_CUNNING,
    SKILL_FURY,
    SKILL_REBIRTH,
    SKILL_SAGE,
    SKILL_SHELL,
    SKILL_SWIFT,
    SKILL_TANK,
    strike,
    strikeRoll,
    toUint16,
} from '@cryptopets/protocol';
