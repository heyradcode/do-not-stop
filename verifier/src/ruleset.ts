import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { hashRuleset, parseRulesetBundle, type Ruleset } from '@cryptopets/protocol';

/**
 * Ruleset artifacts pinned into this package (§H item 2).
 *
 * Content addressing already makes a bundle's *integrity* independent of where it came
 * from: a receipt names a `rulesetHash`, and a bundle either hashes to it or does not get
 * used. What content addressing does not give you is *availability*. If the only copy of
 * the rules a 2026 battle was fought under lives on an endpoint we operate, then replaying
 * that battle in 2030 needs us to still be serving it, and "you can check our homework, as
 * long as we hand you the textbook" is a weaker claim than §H is making.
 *
 * So the bundles are committed here as plain JSON, one file per ruleset, named for its own
 * hash. Anyone with a checkout can replay a historical battle with no network access at
 * all. This includes the ruleset the current build implements: `ENGINE_VERSION` bumps
 * eventually, and when it does, today's ruleset becomes a historical one whose only
 * durable copy is this file.
 *
 * The filename is not decoration. It is checked against the hash recomputed from the
 * file's own contents, so a corrupted or mislabelled artifact fails loudly at load rather
 * than quietly answering to a hash it does not have.
 */

const PINNED_DIR = join(dirname(fileURLToPath(import.meta.url)), '../rulesets');

/** Absolute path to the pinned-artifact directory. Exported so tests can enumerate it. */
export const PINNED_RULESETS_DIR = PINNED_DIR;

/**
 * Every pinned bundle, keyed by lowercase `rulesetHash`.
 *
 * Throws if any artifact does not hash to its own filename. That is a repository
 * integrity problem, not a verification result, and treating it as the latter would mean
 * reporting "this battle could not be replayed" when the truth is "our copy of the rules
 * is corrupt".
 */
export function pinnedRulesets(): Map<string, Ruleset> {
    const registry = new Map<string, Ruleset>();
    for (const filename of readdirSync(PINNED_DIR)) {
        if (!filename.endsWith('.json')) continue;
        const ruleset = parseRulesetBundle(readFileSync(join(PINNED_DIR, filename), 'utf8'));
        const actual = hashRuleset(ruleset).toLowerCase();
        const claimed = filename.slice(0, -'.json'.length).toLowerCase();
        if (actual !== claimed) {
            throw new Error(`pinned ruleset ${filename} hashes to ${actual}, not to the hash it is named for`);
        }
        registry.set(actual, ruleset);
    }
    return registry;
}

/** The filename a bundle must be pinned under. */
export function pinnedRulesetFilename(ruleset: Ruleset): string {
    return `${hashRuleset(ruleset).toLowerCase()}.json`;
}
