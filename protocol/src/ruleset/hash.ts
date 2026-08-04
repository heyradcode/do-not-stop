import { currentSchemaVersion } from '../domain/schemaVersions';
import type { Hex } from '../encoding/bytes';
import { DOMAIN_TAGS } from '../encoding/domain';
import { keccak256Hex } from '../encoding/hash';
import { CanonicalWriter } from '../encoding/writer';

import { assertRuleset, type Ruleset, SKILL_CONFIG_FIELDS } from './types';

/**
 * Canonical encoding of a ruleset.
 *
 * No chain id or deployment id, unlike every other hashed object here. A ruleset is
 * portable by design: the same rules can run on either chain, and binding the hash to
 * a deployment would give one set of rules as many identities as it has environments,
 * which would make consent bound to `rulesetHash` mean less rather than more. Where a
 * deployment matters, the object referencing the ruleset already carries it.
 *
 * The schema version is written directly for the same reason: `writeHeader` bundles
 * version with domain, and there is no domain here.
 */
export function encodeRuleset(ruleset: Ruleset): Uint8Array {
    const checked = assertRuleset(ruleset);
    const writer = CanonicalWriter.withDomain(DOMAIN_TAGS.RULESET)
        .u16(currentSchemaVersion('ruleset'))
        .u32(checked.version)
        .text(checked.engineId)
        .u32(checked.engineVersion)
        .u16(checked.maxRounds)
        .u16(checked.maxLevel);
    for (const field of SKILL_CONFIG_FIELDS) {
        writer.u32(checked.skillConfig[field]);
    }
    return writer.build();
}

/** `rulesetHash`: recorded in every receipt, and what defence consent is bound to. */
export function hashRuleset(ruleset: Ruleset): Hex {
    return keccak256Hex(encodeRuleset(ruleset));
}

/** Throws unless `ruleset` hashes to `expected`. */
export function assertRulesetHash(ruleset: Ruleset, expected: Hex): void {
    const actual = hashRuleset(ruleset);
    if (actual.toLowerCase() !== expected.toLowerCase()) {
        throw new Error(`ruleset hash mismatch: expected ${expected}, computed ${actual}`);
    }
}
