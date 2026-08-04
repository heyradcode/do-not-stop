import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { hashRuleset, parseRulesetBundle, SOURCE_DEFAULT_RULESET } from '@cryptopets/protocol';
import { describe, expect, it } from 'vitest';

import { PINNED_RULESETS_DIR, pinnedRulesetFilename, pinnedRulesets } from '../src/ruleset';

describe('pinned ruleset artifacts', () => {
    it('every artifact hashes to the filename it is pinned under', () => {
        // The invariant that makes the filename trustworthy rather than decorative.
        const files = readdirSync(PINNED_RULESETS_DIR).filter((name) => name.endsWith('.json'));
        expect(files.length).toBeGreaterThan(0);

        for (const filename of files) {
            const ruleset = parseRulesetBundle(readFileSync(join(PINNED_RULESETS_DIR, filename), 'utf8'));
            expect(pinnedRulesetFilename(ruleset)).toBe(filename.toLowerCase());
        }
    });

    it('pins the ruleset this build implements, so today battles stay replayable later', () => {
        // ENGINE_VERSION moves on eventually. When it does, this file is the only durable
        // copy of the rules today's battles were fought under.
        const registry = pinnedRulesets();
        expect(registry.get(hashRuleset(SOURCE_DEFAULT_RULESET).toLowerCase())).toEqual(SOURCE_DEFAULT_RULESET);
    });

    it('keys every entry by the hash recomputed from the file contents', () => {
        for (const [hash, ruleset] of pinnedRulesets()) {
            expect(hash).toBe(hashRuleset(ruleset).toLowerCase());
        }
    });

    it('returns a fresh map each call, so a caller merging into it cannot leak across runs', () => {
        const first = pinnedRulesets();
        const size = first.size;
        first.set('0xdeadbeef', SOURCE_DEFAULT_RULESET);
        expect(pinnedRulesets().size).toBe(size);
        expect(pinnedRulesets().has('0xdeadbeef')).toBe(false);
    });
});
