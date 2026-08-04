import { DEFAULT_SKILL_CONFIG, type SkillConfig } from '../combat/skills';
import { MAX_ROUNDS } from '../combat/sim';
import { DEFAULT_MAX_LEVEL } from '../combat/xp';

/**
 * A versioned, content-addressed statement of the rules a battle was fought under.
 *
 * Every receipt records `rulesetVersion` and `rulesetHash`, and defence consent is
 * bound to the hash. That is what makes "I agreed to the old combat rules" a
 * checkable claim rather than an argument: the rules a battle used are named in the
 * receipt, and the named bundle is published so anyone can replay against exactly
 * those numbers years later (§F, §H).
 *
 * Two kinds of thing live here, and the distinction matters:
 *
 * - **Parameters the engine reads at runtime**: the skill/balance config and the
 *   level cap. These come from `GameConfig` on chain and are owner-tunable, so they
 *   have to travel with the receipt.
 * - **Engine identity**: `engineId` and `engineVersion`, plus `maxRounds` as a
 *   declared constant. The engine's own code cannot hash itself, so a fight-math
 *   change is recorded by bumping `engineVersion`. That bump is a manual step, and
 *   skipping it is how two different implementations end up claiming one ruleset.
 */
export interface Ruleset {
    /** Monotonic ruleset version. The number a receipt reports. */
    version: number;
    /** Which engine implements the fight. */
    engineId: string;
    /** Bumped whenever fight math or progression logic changes. */
    engineVersion: number;
    /** Round cap the engine enforces. Declared here so a bundle is self-describing. */
    maxRounds: number;
    /** Skill balance values, sourced from `GameConfig` on chain. */
    skillConfig: SkillConfig;
    /** Level cap, sourced from `GameConfig.maxLevel`. */
    maxLevel: number;
}

/** The engine this package implements. */
export const ENGINE_ID = 'cryptopets-combat-ts';

/**
 * Bumped when `src/combat/` changes what a fight or a progression delta produces.
 *
 * Not bumped for refactors that cannot change output, which is exactly the judgement
 * call that makes this dangerous: when in doubt, bump. A missed bump means two
 * implementations disagree while both claim the same `rulesetHash`, and the golden
 * vectors are the only thing that would notice.
 */
export const ENGINE_VERSION = 1;

/**
 * The ruleset this build implements with source defaults.
 *
 * Source defaults, not live values: on chain the skill config and level cap come
 * from `GameConfig` and are owner-tunable, so a deployment builds its ruleset by
 * reading the contract. This constant is the local-development baseline and the
 * thing golden vectors are anchored to.
 */
export const SOURCE_DEFAULT_RULESET: Ruleset = {
    version: 1,
    engineId: ENGINE_ID,
    engineVersion: ENGINE_VERSION,
    maxRounds: MAX_ROUNDS,
    skillConfig: DEFAULT_SKILL_CONFIG,
    maxLevel: DEFAULT_MAX_LEVEL,
};

/** Field order for `skillConfig`, which is also its canonical encoding order. */
export const SKILL_CONFIG_FIELDS = [
    'tankHpMult',
    'shellDefMult',
    'swiftCritBonus',
    'cunningCritCap',
    'furyDmgMult',
    'furyHpThreshold',
    'sageMdefMult',
    'bloodlustBps',
] as const satisfies readonly (keyof SkillConfig)[];

/**
 * Sanity bounds, not game-design opinions.
 *
 * Multipliers are x/100 and must be positive: a zero HP multiplier would produce a
 * pet that cannot exist. Basis-point fields cap at 10000 (100%), since a crit chance
 * above certainty is not a tuning choice, it is a typo. Anything inside these bounds
 * is the owner's call.
 */
const MULTIPLIER_BOUNDS = { min: 1, max: 10000 } as const;
const BPS_BOUNDS = { min: 0, max: 10000 } as const;

const MULTIPLIER_FIELDS: readonly (keyof SkillConfig)[] = [
    'tankHpMult',
    'shellDefMult',
    'furyDmgMult',
    'sageMdefMult',
];

const SAFE_ENGINE_ID_PATTERN = /^[a-z0-9][a-z0-9.-]{0,63}$/;

/** Validates an untrusted ruleset, returning a normalized copy. */
export function assertRuleset(ruleset: Ruleset): Ruleset {
    assertPositiveInt(ruleset.version, 'version');
    assertPositiveInt(ruleset.engineVersion, 'engineVersion');
    assertPositiveInt(ruleset.maxRounds, 'maxRounds');
    assertPositiveInt(ruleset.maxLevel, 'maxLevel');

    if (typeof ruleset.engineId !== 'string' || !SAFE_ENGINE_ID_PATTERN.test(ruleset.engineId)) {
        throw new Error(`engineId is not a valid identifier: ${JSON.stringify(ruleset.engineId)}`);
    }
    if (ruleset.maxRounds > 0xffff) {
        throw new Error(`maxRounds must fit in 16 bits, got ${ruleset.maxRounds}`);
    }
    if (ruleset.maxLevel > 0xffff) {
        throw new Error(`maxLevel must fit in 16 bits, got ${ruleset.maxLevel}`);
    }

    const skillConfig = {} as SkillConfig;
    for (const field of SKILL_CONFIG_FIELDS) {
        const value = ruleset.skillConfig?.[field];
        const bounds = MULTIPLIER_FIELDS.includes(field) ? MULTIPLIER_BOUNDS : BPS_BOUNDS;
        if (!Number.isSafeInteger(value) || value < bounds.min || value > bounds.max) {
            throw new Error(
                `skillConfig.${field} must be an integer between ${bounds.min} and ${bounds.max}, got ${value}`,
            );
        }
        skillConfig[field] = value;
    }

    return {
        version: ruleset.version,
        engineId: ruleset.engineId,
        engineVersion: ruleset.engineVersion,
        maxRounds: ruleset.maxRounds,
        skillConfig,
        maxLevel: ruleset.maxLevel,
    };
}

function assertPositiveInt(value: number, field: string): void {
    if (!Number.isSafeInteger(value) || value < 1) {
        throw new Error(`${field} must be a positive integer, got ${value}`);
    }
}
