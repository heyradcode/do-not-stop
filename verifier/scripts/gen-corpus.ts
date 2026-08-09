/**
 * Regenerates this package's committed artifacts:
 *
 * - `rulesets/<hash>.json`, the pinned ruleset bundles (§H item 2)
 * - `fixtures/corpus.json`, a chain of valid signed receipts
 * - `fixtures/signing-keys.json`, the trusted key that signed them
 * - `fixtures/corpus-tampered.json`, the same chain with one receipt altered
 *
 * Run with `pnpm --filter @cryptopets/verifier corpus`.
 *
 * Everything here is deterministic — a fixed test key, RFC6979 deterministic ECDSA, a real
 * but fixed drand round, and a fixed snapshot — so regenerating produces no diff unless
 * something that actually matters changed. `tests/corpus.test.ts` asserts exactly that,
 * which is what makes a diff here meaningful rather than noise.
 *
 * The receipt-building helpers are imported from `tests/fixtures/` on purpose: there
 * should be exactly one definition of what a valid signed receipt looks like, and
 * duplicating it into a script is how the committed corpus and the unit tests would
 * quietly drift apart.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { publishRuleset, SOURCE_DEFAULT_RULESET } from '@cryptopets/protocol';

import { GEARED_RULESET } from '../tests/fixtures/signedReceipt';

import { buildCorpus, buildTamperedCorpus, corpusSigningKeys } from '../tests/fixtures/corpus';

const HERE = dirname(fileURLToPath(import.meta.url));
const RULESETS_DIR = join(HERE, '../rulesets');
const FIXTURES_DIR = join(HERE, '../fixtures');

function writeJson(path: string, value: unknown): void {
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    console.log(`wrote ${path}`);
}

mkdirSync(RULESETS_DIR, { recursive: true });
mkdirSync(FIXTURES_DIR, { recursive: true });

// The rulesets this corpus's battles were fought under, pinned so they stay replayable
// after ENGINE_VERSION moves on. `serializeRuleset` already emits a trailing newline.
//
// Two of them: the source default that the ungeared receipts name, and the geared one the
// last receipt names. A pinned bundle per ruleset is the rule, not an exception — a
// receipt whose bundle is missing is a receipt nobody can replay.
for (const ruleset of [SOURCE_DEFAULT_RULESET, GEARED_RULESET]) {
    const { hash, json } = publishRuleset(ruleset);
    const rulesetPath = join(RULESETS_DIR, `${hash.toLowerCase()}.json`);
    writeFileSync(rulesetPath, json, 'utf8');
    console.log(`wrote ${rulesetPath}`);
}

writeJson(join(FIXTURES_DIR, 'corpus.json'), buildCorpus());
writeJson(join(FIXTURES_DIR, 'corpus-tampered.json'), buildTamperedCorpus());
writeJson(join(FIXTURES_DIR, 'signing-keys.json'), corpusSigningKeys());
