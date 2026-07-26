import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { loadReceipts, loadSigningKeys } from '../src/io';
import { pinnedRulesets } from '../src/ruleset';
import { verifyReceipts } from '../src/verify';

import { buildCorpus, buildTamperedCorpus, corpusSigningKeys } from './fixtures/corpus';

/**
 * The committed-corpus regression guard, and the same thing CI runs on every PR.
 *
 * Two assertions, and the second matters as much as the first: a verifier that had
 * degraded into always passing would sail through "the honest corpus verifies" and be
 * caught only by "the tampered corpus does not".
 */

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '../fixtures');

function readFixture(name: string): string {
    return readFileSync(join(FIXTURES, name), 'utf8');
}

describe('the committed corpus is in sync with its generator', () => {
    // Everything in the generator is deterministic, so a diff here means something that
    // actually matters changed, not that the fixture drifted on its own.
    it.each([
        ['corpus.json', () => buildCorpus()],
        ['corpus-tampered.json', () => buildTamperedCorpus()],
        ['signing-keys.json', () => corpusSigningKeys()],
    ])('%s matches a fresh generation', (name, build) => {
        expect(JSON.parse(readFixture(name))).toEqual(JSON.parse(JSON.stringify(build())));
    });
});

describe('the honest corpus verifies end to end', () => {
    it('passes every check, loaded exactly as the CLI loads it', async () => {
        const envelopes = await loadReceipts(join(FIXTURES, 'corpus.json'));
        const keys = await loadSigningKeys(join(FIXTURES, 'signing-keys.json'));

        const report = verifyReceipts(envelopes, keys, { rulesets: pinnedRulesets() });

        expect(report.results.filter((result) => !result.ok)).toEqual([]);
        expect(report.ok).toBe(true);
    });

    it('replays against a pinned bundle, with no network access and no --rulesets flag', async () => {
        const envelopes = await loadReceipts(join(FIXTURES, 'corpus.json'));
        const pinned = pinnedRulesets();
        // The point of pinning: the rules these battles were fought under are in the
        // checkout, so this works with the operator entirely absent.
        expect(pinned.has(envelopes[0]!.payload.rulesetHash.toLowerCase())).toBe(true);
    });

    it('covers more than one receipt, so the continuity walk is actually exercised', async () => {
        const envelopes = await loadReceipts(join(FIXTURES, 'corpus.json'));
        expect(envelopes.length).toBeGreaterThan(1);
    });
});

describe('the tampered corpus is rejected', () => {
    it('fails, and names every reason rather than only the first', async () => {
        const envelopes = await loadReceipts(join(FIXTURES, 'corpus-tampered.json'));
        const keys = await loadSigningKeys(join(FIXTURES, 'signing-keys.json'));

        const report = verifyReceipts(envelopes, keys, { rulesets: pinnedRulesets() });
        const failed = report.results.filter((result) => !result.ok);

        expect(report.ok).toBe(false);
        // The altered receipt fails its own checks...
        expect(failed).toContainEqual(
            expect.objectContaining({ check: 'combat-replay', subject: 'btl_0002', ok: false }),
        );
        expect(failed).toContainEqual(
            expect.objectContaining({ check: 'beacon-signature', subject: 'btl_0002', ok: false }),
        );
        // ...and the break propagates down the chain, which is what the chain is for.
        expect(failed).toContainEqual(expect.objectContaining({ check: 'chain-continuity', ok: false }));
    });

    it('leaves the untampered receipts passing, so failures stay attributable', async () => {
        const envelopes = await loadReceipts(join(FIXTURES, 'corpus-tampered.json'));
        const keys = await loadSigningKeys(join(FIXTURES, 'signing-keys.json'));

        const report = verifyReceipts(envelopes, keys, { rulesets: pinnedRulesets() });
        const firstReceipt = report.results.filter((result) => result.subject === 'btl_0001');

        expect(firstReceipt.length).toBeGreaterThan(0);
        expect(firstReceipt.every((result) => result.ok)).toBe(true);
    });
});
