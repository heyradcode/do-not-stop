import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { loadReceipts, loadSigningKeys } from '../src/io';
import { pinnedRulesets } from '../src/ruleset';
import { verifyReceipts } from '../src/verify';

import {
    buildCorpus,
    buildCrossChainCorpus,
    buildTamperedCorpus,
    corpusSigningKeys,
} from './fixtures/corpus';

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
        ['corpus-cross-chain.json', () => buildCrossChainCorpus()],
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

/**
 * The dual-chain wallet page, run through the same path the CLI uses.
 *
 * `corpus.json` is a per-key sequence export and so can never mix keys. This one is the
 * wallet view of a player who fought on both chains, which is the shape that made the
 * verifier report `mixed-signing-key` against an honest operator until the chain walk was
 * split per key. Committed so CI keeps checking it, not just the unit tests.
 */
describe('a wallet page spanning both chains', () => {
    it('verifies clean, loaded exactly as the CLI loads it', async () => {
        const envelopes = await loadReceipts(join(FIXTURES, 'corpus-cross-chain.json'));
        const keys = await loadSigningKeys(join(FIXTURES, 'signing-keys.json'));

        const report = verifyReceipts(envelopes, keys, { rulesets: pinnedRulesets() });

        expect(report.results.filter((result) => !result.ok)).toEqual([]);
        expect(report.ok).toBe(true);
    });

    // The interleaving is the point: neither key's receipts are contiguous in the file, so a
    // walk that did not group by key would break on the first switch.
    it('really does interleave the two keys', async () => {
        const envelopes = await loadReceipts(join(FIXTURES, 'corpus-cross-chain.json'));
        const keyIds = envelopes.map((envelope) => envelope.signingKeyId);

        expect(new Set(keyIds).size).toBe(2);
        // Adjacent entries from different keys somewhere in the list.
        expect(keyIds.some((keyId, index) => index > 0 && keyId !== keyIds[index - 1])).toBe(true);
    });

    // One walk per key, so a failure names the chain that broke rather than the corpus.
    it('reports one chain-continuity result per signing key', async () => {
        const envelopes = await loadReceipts(join(FIXTURES, 'corpus-cross-chain.json'));
        const keys = await loadSigningKeys(join(FIXTURES, 'signing-keys.json'));

        const report = verifyReceipts(envelopes, keys, { rulesets: pinnedRulesets() });
        const continuity = report.results.filter((result) => result.check === 'chain-continuity');

        expect(continuity).toHaveLength(2);
        expect(new Set(continuity.map((result) => result.subject)).size).toBe(2);
    });
});
