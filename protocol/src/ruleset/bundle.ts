import type { Hex } from '../encoding/bytes';

import { assertRulesetHash, hashRuleset } from './hash';
import { assertRuleset, type Ruleset, SKILL_CONFIG_FIELDS } from './types';

/**
 * The published, content-addressed ruleset artifact (§H item 2).
 *
 * A receipt names a `rulesetHash`; without the matching bundle, a third party has the
 * name of the rules but not the rules, so replay stops being possible. Each version is
 * therefore published as an immutable JSON document, and its integrity does not depend
 * on where it was fetched from: a verifier parses it, recomputes `rulesetHash`, and
 * compares against the receipt.
 *
 * The JSON is transport only. Hashing goes through the binary encoder, so the artifact
 * does not have to be canonical JSON, and no verifier has to agree with us about
 * property order or number formatting.
 */

/** Serializes a ruleset for publication. Stable key order, so diffs stay readable. */
export function serializeRuleset(ruleset: Ruleset): string {
    const checked = assertRuleset(ruleset);
    const skillConfig: Record<string, number> = {};
    for (const field of SKILL_CONFIG_FIELDS) {
        skillConfig[field] = checked.skillConfig[field];
    }
    return `${JSON.stringify(
        {
            version: checked.version,
            engineId: checked.engineId,
            engineVersion: checked.engineVersion,
            maxRounds: checked.maxRounds,
            maxLevel: checked.maxLevel,
            skillConfig,
        },
        null,
        2,
    )}\n`;
}

const RULESET_KEYS = ['version', 'engineId', 'engineVersion', 'maxRounds', 'maxLevel', 'skillConfig'] as const;

/**
 * Parses a published bundle.
 *
 * Unknown keys are rejected. A bundle carrying an extra field would hash identically to
 * one without it, so two different documents would answer to one `rulesetHash`, and a
 * reader would have no way to tell which the battle used. Missing keys are rejected by
 * `assertRuleset`.
 */
export function parseRulesetBundle(json: string): Ruleset {
    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch (error) {
        throw new Error(`ruleset bundle is not valid JSON: ${(error as Error).message}`);
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('ruleset bundle must be a JSON object');
    }
    const record = parsed as Record<string, unknown>;

    const unexpected = Object.keys(record).filter((key) => !RULESET_KEYS.includes(key as never));
    if (unexpected.length > 0) {
        throw new Error(`ruleset bundle has unexpected keys: ${unexpected.join(', ')}`);
    }
    const skillConfig = record.skillConfig;
    if (typeof skillConfig === 'object' && skillConfig !== null) {
        const unexpectedSkills = Object.keys(skillConfig as Record<string, unknown>).filter(
            (key) => !SKILL_CONFIG_FIELDS.includes(key as never),
        );
        if (unexpectedSkills.length > 0) {
            throw new Error(`ruleset bundle skillConfig has unexpected keys: ${unexpectedSkills.join(', ')}`);
        }
    }

    return assertRuleset(record as unknown as Ruleset);
}

/**
 * Parses a bundle and confirms it is the one a receipt named.
 *
 * This is the call a verifier makes: fetching a bundle from anywhere is safe as long as
 * its hash matches the receipt, because the hash is the identity.
 */
export function loadRulesetBundle(json: string, expectedHash: Hex): Ruleset {
    const ruleset = parseRulesetBundle(json);
    assertRulesetHash(ruleset, expectedHash);
    return ruleset;
}

/** Convenience for publishing: the artifact plus the hash it will be addressed by. */
export function publishRuleset(ruleset: Ruleset): { hash: Hex; json: string } {
    return { hash: hashRuleset(ruleset), json: serializeRuleset(ruleset) };
}
