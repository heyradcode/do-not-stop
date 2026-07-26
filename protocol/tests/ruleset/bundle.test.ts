import { describe, expect, it } from 'vitest';

import { DEFAULT_SKILL_CONFIG, MAX_ROUNDS } from '../../src/combat';
import type { Hex } from '../../src/encoding/bytes';
import {
    assertRuleset,
    assertRulesetHash,
    ENGINE_ID,
    ENGINE_VERSION,
    hashRuleset,
    loadRulesetBundle,
    parseRulesetBundle,
    publishRuleset,
    type Ruleset,
    serializeRuleset,
    SOURCE_DEFAULT_RULESET,
} from '../../src/ruleset';

describe('SOURCE_DEFAULT_RULESET', () => {
    it('reflects what the engine actually implements', () => {
        // If a combat constant moves and this drifts, a receipt would name rules the
        // engine is not running.
        expect(SOURCE_DEFAULT_RULESET.maxRounds).toBe(MAX_ROUNDS);
        expect(SOURCE_DEFAULT_RULESET.skillConfig).toEqual(DEFAULT_SKILL_CONFIG);
        expect(SOURCE_DEFAULT_RULESET.engineId).toBe(ENGINE_ID);
        expect(SOURCE_DEFAULT_RULESET.engineVersion).toBe(ENGINE_VERSION);
    });
});

describe('assertRuleset', () => {
    it('accepts the source defaults', () => {
        expect(() => assertRuleset(SOURCE_DEFAULT_RULESET)).not.toThrow();
    });

    it.each([
        ['version', { version: 0 }],
        ['engineVersion', { engineVersion: 0 }],
        ['maxRounds', { maxRounds: 0 }],
        ['maxLevel', { maxLevel: 0 }],
        ['engineId', { engineId: 'Not An Id' }],
    ])('rejects an invalid %s', (_field, patch) => {
        expect(() => assertRuleset({ ...SOURCE_DEFAULT_RULESET, ...patch } as Ruleset)).toThrow();
    });

    it('rejects a zero multiplier, which would produce a pet that cannot exist', () => {
        expect(() =>
            assertRuleset({
                ...SOURCE_DEFAULT_RULESET,
                skillConfig: { ...DEFAULT_SKILL_CONFIG, tankHpMult: 0 },
            }),
        ).toThrow(/tankHpMult/);
    });

    it('rejects a basis-point value above certainty', () => {
        expect(() =>
            assertRuleset({
                ...SOURCE_DEFAULT_RULESET,
                skillConfig: { ...DEFAULT_SKILL_CONFIG, cunningCritCap: 10001 },
            }),
        ).toThrow(/cunningCritCap/);
    });

    it('allows the owner-tunable range in between', () => {
        expect(() =>
            assertRuleset({
                ...SOURCE_DEFAULT_RULESET,
                skillConfig: { ...DEFAULT_SKILL_CONFIG, tankHpMult: 500, bloodlustBps: 10000 },
            }),
        ).not.toThrow();
    });

    it('rejects a missing skill field', () => {
        const incomplete = { ...DEFAULT_SKILL_CONFIG } as Record<string, number>;
        delete incomplete.bloodlustBps;
        expect(() =>
            assertRuleset({ ...SOURCE_DEFAULT_RULESET, skillConfig: incomplete as never }),
        ).toThrow(/bloodlustBps/);
    });
});

describe('bundle round trip', () => {
    it('parses back to the same ruleset and hash', () => {
        const { hash, json } = publishRuleset(SOURCE_DEFAULT_RULESET);
        expect(parseRulesetBundle(json)).toEqual(SOURCE_DEFAULT_RULESET);
        expect(hashRuleset(parseRulesetBundle(json))).toBe(hash);
    });

    it('survives reformatting, since JSON is transport and the binary encoding is the hash', () => {
        const compact = JSON.stringify(JSON.parse(serializeRuleset(SOURCE_DEFAULT_RULESET)));
        expect(hashRuleset(parseRulesetBundle(compact))).toBe(hashRuleset(SOURCE_DEFAULT_RULESET));
    });

    it('rejects unexpected top-level keys', () => {
        // An extra field would hash identically to a bundle without it, so two
        // documents would answer to one rulesetHash.
        const tampered = JSON.stringify({ ...JSON.parse(serializeRuleset(SOURCE_DEFAULT_RULESET)), note: 'hi' });
        expect(() => parseRulesetBundle(tampered)).toThrow(/unexpected keys: note/);
    });

    it('rejects unexpected skillConfig keys', () => {
        const parsed = JSON.parse(serializeRuleset(SOURCE_DEFAULT_RULESET));
        parsed.skillConfig.mysteryBonus = 1;
        expect(() => parseRulesetBundle(JSON.stringify(parsed))).toThrow(/skillConfig has unexpected keys/);
    });

    it('rejects malformed JSON and non-objects', () => {
        expect(() => parseRulesetBundle('{')).toThrow(/not valid JSON/);
        expect(() => parseRulesetBundle('[]')).toThrow(/must be a JSON object/);
        expect(() => parseRulesetBundle('"a string"')).toThrow(/must be a JSON object/);
    });
});

describe('loadRulesetBundle', () => {
    it('accepts a bundle matching the hash a receipt named', () => {
        const { hash, json } = publishRuleset(SOURCE_DEFAULT_RULESET);
        // Fetching from anywhere is safe when the hash is the identity.
        expect(loadRulesetBundle(json, hash)).toEqual(SOURCE_DEFAULT_RULESET);
    });

    it('rejects a bundle whose parameters were altered after publication', () => {
        const { hash } = publishRuleset(SOURCE_DEFAULT_RULESET);
        const tampered = serializeRuleset({
            ...SOURCE_DEFAULT_RULESET,
            skillConfig: { ...DEFAULT_SKILL_CONFIG, furyDmgMult: 200 },
        });
        expect(() => loadRulesetBundle(tampered, hash)).toThrow(/ruleset hash mismatch/);
    });
});

describe('assertRulesetHash', () => {
    it('ignores hash casing', () => {
        const hash = hashRuleset(SOURCE_DEFAULT_RULESET);
        expect(() => assertRulesetHash(SOURCE_DEFAULT_RULESET, hash.toUpperCase() as Hex)).not.toThrow();
    });

    it('names both values when it fails', () => {
        expect(() => assertRulesetHash(SOURCE_DEFAULT_RULESET, `0x${'00'.repeat(32)}`)).toThrow(
            /expected 0x0{64}, computed 0x/,
        );
    });
});

describe('chain independence', () => {
    it('does not bind a ruleset to a chain or deployment', () => {
        // Deliberate: the same rules can run on either chain, and binding the hash to
        // a deployment would give one set of rules several identities, which would make
        // consent bound to rulesetHash weaker rather than stronger.
        const json = serializeRuleset(SOURCE_DEFAULT_RULESET);
        expect(json).not.toContain('chainId');
        expect(json).not.toContain('deploymentId');
    });
});
