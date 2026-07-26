import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { hashRuleset, publishRuleset, SOURCE_DEFAULT_RULESET } from '@cryptopets/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { builtInRulesets, loadRulesets } from '../../src/io/loadRulesets';

let dir: string;

beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'verifier-loadrulesets-'));
});

afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
});

describe('builtInRulesets', () => {
    it('holds this build source-default ruleset, keyed by its own hash', () => {
        const registry = builtInRulesets();
        expect(registry.get(hashRuleset(SOURCE_DEFAULT_RULESET).toLowerCase())).toEqual(SOURCE_DEFAULT_RULESET);
    });

    it('returns a fresh map each call, so a caller merging into it cannot leak across runs', () => {
        const first = builtInRulesets();
        first.set('0xdeadbeef', SOURCE_DEFAULT_RULESET);
        expect(builtInRulesets().has('0xdeadbeef')).toBe(false);
    });
});

describe('loadRulesets', () => {
    it('loads the { ..., bundle } shape GET /api/battle/rulesets/:hash serves', async () => {
        const { hash, json } = publishRuleset(SOURCE_DEFAULT_RULESET);
        const file = join(dir, 'ruleset.json');
        await writeFile(file, JSON.stringify({ rulesetHash: hash, version: 1, bundle: JSON.parse(json) }));

        const registry = await loadRulesets(file);
        expect(registry.get(hash.toLowerCase())).toEqual(SOURCE_DEFAULT_RULESET);
    });

    it('loads a bare bundle object saved to a file by hand', async () => {
        const { hash, json } = publishRuleset(SOURCE_DEFAULT_RULESET);
        const file = join(dir, 'bare.json');
        await writeFile(file, json);

        const registry = await loadRulesets(file);
        expect(registry.get(hash.toLowerCase())).toEqual(SOURCE_DEFAULT_RULESET);
    });

    it('loads an array of bundles', async () => {
        const tweaked = { ...SOURCE_DEFAULT_RULESET, version: 2 };
        const file = join(dir, 'many.json');
        await writeFile(
            file,
            JSON.stringify([JSON.parse(publishRuleset(SOURCE_DEFAULT_RULESET).json), JSON.parse(publishRuleset(tweaked).json)]),
        );

        const registry = await loadRulesets(file);
        expect(registry.size).toBe(2);
        expect(registry.get(hashRuleset(tweaked).toLowerCase())).toEqual(tweaked);
    });

    it('keys by the hash recomputed from the contents, not by one the source claimed', async () => {
        // The whole point of content addressing: a source cannot make a bundle answer to a
        // hash it does not actually have.
        const { json } = publishRuleset(SOURCE_DEFAULT_RULESET);
        const file = join(dir, 'lying.json');
        await writeFile(file, JSON.stringify({ rulesetHash: `0x${'99'.repeat(32)}`, bundle: JSON.parse(json) }));

        const registry = await loadRulesets(file);
        expect(registry.has(`0x${'99'.repeat(32)}`)).toBe(false);
        expect(registry.has(hashRuleset(SOURCE_DEFAULT_RULESET).toLowerCase())).toBe(true);
    });

    it('rejects a bundle carrying unknown keys', async () => {
        // Two documents answering to one hash would leave a reader unable to tell which
        // the battle used.
        const { json } = publishRuleset(SOURCE_DEFAULT_RULESET);
        const file = join(dir, 'extra.json');
        await writeFile(file, JSON.stringify({ ...JSON.parse(json), surprise: 1 }));
        await expect(loadRulesets(file)).rejects.toThrow(/unexpected keys/);
    });

    it('rejects a non-object entry', async () => {
        const file = join(dir, 'bad.json');
        await writeFile(file, JSON.stringify(['not-an-object']));
        await expect(loadRulesets(file)).rejects.toThrow(/must be an object/);
    });
});
