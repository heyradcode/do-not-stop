import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { hashRuleset, type Ruleset, SKILL_CONFIG_FIELDS, SOURCE_DEFAULT_RULESET } from '../../src/ruleset';

/**
 * Consumes contracts/test-vectors/protocol-ruleset.json. A failure means the
 * implementation drifted, and the fix is the code, never the vector (`AGENTS.md`).
 */
interface RulesetCase {
    name: string;
    note: string;
    /** As stored: item types are decimal strings, since a uint256 is not a JSON number. */
    ruleset: Omit<Ruleset, 'itemCatalog'> & {
        itemCatalog?: { itemType: string; slot: number; hp: number; atk: number; def: number; int: number; mdef: number }[];
    };
    expectedRulesetHash: string;
}

/** Widens the stored item types back to bigints, as `parseRulesetBundle` does. */
function toRuleset(stored: RulesetCase['ruleset']): Ruleset {
    const { itemCatalog, ...rest } = stored;
    if (!itemCatalog) {
        return rest;
    }
    return {
        ...rest,
        itemCatalog: itemCatalog.map((item) => ({ ...item, itemType: BigInt(item.itemType) })),
    };
}

const here = dirname(fileURLToPath(import.meta.url));
const vectorsPath = join(here, '../../../contracts/test-vectors/protocol-ruleset.json');
const vectors = JSON.parse(readFileSync(vectorsPath, 'utf8')) as { cases: RulesetCase[] };

const byName = new Map(vectors.cases.map((c) => [c.name, c]));

describe('ruleset golden vectors', () => {
    for (const c of vectors.cases) {
        it(`matches the recorded hash for "${c.name}"`, () => {
            expect(hashRuleset(toRuleset(c.ruleset))).toBe(c.expectedRulesetHash);
        });
    }
});

describe('properties the vectors exist to pin', () => {
    it('covers every skill tunable individually', () => {
        // A tunable missing from this list could change without moving the hash,
        // which would be a balance change nobody consented to.
        for (const field of SKILL_CONFIG_FIELDS) {
            expect(byName.has(`skill-${field}`)).toBe(true);
        }
    });

    it('gives every case a distinct hash', () => {
        const hashes = vectors.cases.map((c) => c.expectedRulesetHash);
        expect(new Set(hashes).size).toBe(hashes.length);
    });

    it('anchors the source-default ruleset this build implements', () => {
        const anchor = byName.get('source-defaults-v2')!;
        expect(hashRuleset(SOURCE_DEFAULT_RULESET)).toBe(anchor.expectedRulesetHash);
    });

    // Version 1 rulesets have receipts signed against them, so their hash has to keep
    // reproducing forever. This is the guard on the v1 encoder specifically: it is the one
    // path that no longer runs in production and would otherwise rot unnoticed.
    it('still reproduces the version 1 hash from before the item catalog existed', () => {
        const v1 = byName.get('source-defaults')!;
        expect(hashRuleset({ ...SOURCE_DEFAULT_RULESET, engineVersion: 1, schemaVersion: 1, itemCatalog: [] })).toBe(
            v1.expectedRulesetHash,
        );
    });

    // A rebalance must move the hash. Defence consent is bound to it, so re-pricing a
    // sword invalidates consent given under the old numbers rather than silently
    // reinterpreting it (§D).
    it('separates a priced catalog from an empty one', () => {
        expect(byName.get('item-catalog')!.expectedRulesetHash).not.toBe(
            byName.get('source-defaults-v2')!.expectedRulesetHash,
        );
    });

    it('moves the hash for a version or engine bump', () => {
        const base = byName.get('source-defaults')!.expectedRulesetHash;
        expect(byName.get('version-bump')!.expectedRulesetHash).not.toBe(base);
        expect(byName.get('engine-version-bump')!.expectedRulesetHash).not.toBe(base);
        expect(byName.get('other-engine-id')!.expectedRulesetHash).not.toBe(base);
    });
});
