import { hashBattleReceipt, hashRuleset, SOURCE_DEFAULT_RULESET } from '@cryptopets/protocol';
import { describe, expect, it } from 'vitest';

import { builtInRulesets } from '../src/io/loadRulesets';
import { verifyReceipts } from '../src/verify';
import {
    buildReceipt,
    buildSignedReceipt,
    envelopeFor,
    FORGED_BEACON,
    SOLANA_SIGNING_KEY_ID,
    SOLANA_SNAPSHOT,
    testTrustedKey,
} from './fixtures/signedReceipt';

/** Every check a single well-formed receipt is expected to produce, in pipeline order. */
const SINGLE_RECEIPT_CHECKS = [
    'seed-derivation',
    'operator-signature',
    'beacon-signature',
    'combat-replay',
    'equipment',
    'progression',
    'chain-continuity',
];

function checksByName(results: { check: string; ok: boolean; detail?: string }[]) {
    return new Map(results.map((result) => [result.check, result]));
}

describe('verifyReceipts', () => {
    it('passes every check for a single well-formed, correctly-signed receipt', () => {
        const { envelope, trustedKey } = buildSignedReceipt();
        const report = verifyReceipts([envelope], [trustedKey]);
        expect(report.results.map((r) => r.check)).toEqual(SINGLE_RECEIPT_CHECKS);
        expect(report.ok).toBe(true);
    });

    it('reports every failure rather than stopping at the first', () => {
        // A forged beacon and an inflated progression at once: both must be named.
        const receipt = buildReceipt({
            beacon: FORGED_BEACON,
            patch: {
                progression: {
                    ...buildReceipt({ beacon: FORGED_BEACON }).progression,
                    attacker: { ...buildReceipt({ beacon: FORGED_BEACON }).progression.attacker, xp: 9999 },
                },
            },
        });
        const report = verifyReceipts([envelopeFor(receipt)], [testTrustedKey()]);
        const byName = checksByName(report.results);

        expect(report.ok).toBe(false);
        expect(byName.get('beacon-signature')?.ok).toBe(false);
        expect(byName.get('progression')?.ok).toBe(false);
        // The seed still derives honestly from the forged beacon, and the fight itself was
        // run on that seed — so those two checks pass, which is the accurate answer.
        expect(byName.get('seed-derivation')?.ok).toBe(true);
        expect(byName.get('combat-replay')?.ok).toBe(true);
    });

    it('names a chosen seed as its own failure, not merely a malformed receipt', () => {
        const receipt = buildReceipt({ patch: { seed: `0x${'99'.repeat(32)}` } });
        // The receipt cannot be hashed, so the envelope carries a stand-in hash.
        const envelope = envelopeFor(receipt, `0x${'aa'.repeat(32)}`);

        const report = verifyReceipts([envelope], [testTrustedKey()]);
        const byName = checksByName(report.results);

        expect(report.ok).toBe(false);
        expect(byName.get('seed-derivation')?.ok).toBe(false);
        expect(byName.get('seed-derivation')?.detail).toMatch(/its own inputs derive/);
        // It is also malformed, and saying so is honest; the point is that the specific
        // accusation is not buried underneath the shape complaint.
        expect(byName.get('malformed-receipt')?.ok).toBe(false);
    });

    it('excludes a malformed receipt from the chain walk instead of crashing it', () => {
        const good = buildSignedReceipt({ battleId: 'btl_0001' });
        const broken = envelopeFor(buildReceipt({ battleId: 'btl_0002', patch: { seed: `0x${'99'.repeat(32)}` } }), `0x${'aa'.repeat(32)}`);

        const report = verifyReceipts([good.envelope, broken], [good.trustedKey]);
        // One well-formed member left, so continuity still runs and still passes.
        expect(checksByName(report.results).get('chain-continuity')?.ok).toBe(true);
        expect(report.ok).toBe(false);
    });

    it('fails a receipt whose fight result does not match a replay of its own inputs', () => {
        const honest = buildReceipt();
        const receipt = buildReceipt({
            patch: { result: { ...honest.result, rounds: honest.result.rounds + 1 } },
        });
        const report = verifyReceipts([envelopeFor(receipt)], [testTrustedKey()]);
        const replay = checksByName(report.results).get('combat-replay');

        expect(replay?.ok).toBe(false);
        expect(replay?.detail).toMatch(/rounds: replay=\d+ receipt=\d+/);
    });

    it('fails a receipt whose combat log hash does not match the replayed log', () => {
        const receipt = buildReceipt({ patch: { combatLogHash: `0x${'cc'.repeat(32)}` } });
        const report = verifyReceipts([envelopeFor(receipt)], [testTrustedKey()]);
        const replay = checksByName(report.results).get('combat-replay');

        expect(replay?.ok).toBe(false);
        expect(replay?.detail).toMatch(/combatLogHash/);
    });

    it('fails closed when the named ruleset bundle was not supplied', () => {
        // A receipt naming a ruleset this build does not have: replay and progression
        // cannot run, and reporting them as passed would be a lie.
        const receipt = buildReceipt({ rulesetHash: `0x${'77'.repeat(32)}` });
        const report = verifyReceipts([envelopeFor(receipt)], [testTrustedKey()], {
            rulesets: new Map(),
        });
        const byName = checksByName(report.results);

        expect(report.ok).toBe(false);
        expect(byName.get('ruleset-unavailable')?.ok).toBe(false);
        expect(byName.has('combat-replay')).toBe(false);
        expect(byName.has('progression')).toBe(false);
    });

    it('uses the built-in source-default ruleset when none is supplied', () => {
        const { envelope, trustedKey } = buildSignedReceipt();
        expect(envelope.payload.rulesetHash.toLowerCase()).toBe(hashRuleset(SOURCE_DEFAULT_RULESET).toLowerCase());
        expect(builtInRulesets().has(envelope.payload.rulesetHash.toLowerCase())).toBe(true);
        expect(verifyReceipts([envelope], [trustedKey]).ok).toBe(true);
    });

    it('reports untrusted signatures per receipt while still walking the chain', () => {
        const first = buildSignedReceipt({ battleId: 'btl_0001' });
        const second = buildSignedReceipt({
            battleId: 'btl_0002',
            sequence: 2,
            previousReceiptHash: hashBattleReceipt(first.receipt),
            createdAt: first.receipt.createdAt + 1,
        });
        // No trusted keys: both signatures fail closed, but the chain itself is intact.
        const report = verifyReceipts([first.envelope, second.envelope], []);
        const signatureResults = report.results.filter((r) => r.check === 'operator-signature');

        expect(report.ok).toBe(false);
        expect(signatureResults).toHaveLength(2);
        expect(signatureResults.every((r) => !r.ok)).toBe(true);
        expect(checksByName(report.results).get('chain-continuity')?.ok).toBe(true);
    });

    it('passes an empty input with no results at all', () => {
        expect(verifyReceipts([], [])).toEqual({ results: [], ok: true });
    });
});

/**
 * A deployment serving both chains signs under two keys: §G gives each reward domain its
 * own, and `keyConfigFor` refuses to start a multi-family deployment that shares one. So the
 * per-wallet and per-pet corpus views carry receipts from both, interleaved.
 *
 * The chain walk is per key. Running it over the whole corpus reported `mixed-signing-key`
 * at the first receipt of the second key — an accusation, against an honest operator, for
 * the ordinary dual-chain case.
 */
describe('a corpus spanning both chains', () => {
    /** One EVM receipt and one Solana receipt, each first in its own key's chain. */
    function crossChainCorpus() {
        const evm = buildSignedReceipt({ battleId: 'btl_evm_1', sequence: 1 });
        const solana = buildSignedReceipt({
            battleId: 'btl_sol_1',
            snapshot: SOLANA_SNAPSHOT,
            signingKeyId: SOLANA_SIGNING_KEY_ID,
            sequence: 1,
        });
        return { evm, solana };
    }

    it('verifies clean, rather than calling an honest operator a forger', () => {
        const { evm, solana } = crossChainCorpus();
        const report = verifyReceipts(
            [evm.envelope, solana.envelope],
            [evm.trustedKey, solana.trustedKey],
        );

        const continuity = report.results.filter((r) => r.check === 'chain-continuity');
        expect(continuity.every((r) => r.ok)).toBe(true);
        expect(report.ok).toBe(true);
    });

    // One per key, each naming the key it walked, so a failure says which chain broke.
    it('walks one chain per signing key', () => {
        const { evm, solana } = crossChainCorpus();
        const report = verifyReceipts(
            [evm.envelope, solana.envelope],
            [evm.trustedKey, solana.trustedKey],
        );

        const continuity = report.results.filter((r) => r.check === 'chain-continuity');
        expect(continuity).toHaveLength(2);
        expect(continuity.map((r) => r.subject)).toEqual([
            evm.receipt.signingKeyId,
            SOLANA_SIGNING_KEY_ID,
        ]);
    });

    // Splitting the corpus must not soften the check: a break inside one key's run is still
    // a break, and the other key's clean run must not paper over it.
    it('still catches a break within one chain, and blames only that one', () => {
        const evm = buildSignedReceipt({ battleId: 'btl_evm_1', sequence: 1 });
        const solanaFirst = buildSignedReceipt({
            battleId: 'btl_sol_1',
            snapshot: SOLANA_SNAPSHOT,
            signingKeyId: SOLANA_SIGNING_KEY_ID,
            sequence: 1,
        });
        // Sequence 3 where 2 belongs: a withheld Solana receipt.
        const solanaGap = buildSignedReceipt({
            battleId: 'btl_sol_3',
            snapshot: SOLANA_SNAPSHOT,
            signingKeyId: SOLANA_SIGNING_KEY_ID,
            sequence: 3,
            previousReceiptHash: hashBattleReceipt(solanaFirst.receipt),
        });

        const report = verifyReceipts(
            [evm.envelope, solanaFirst.envelope, solanaGap.envelope],
            [evm.trustedKey, solanaFirst.trustedKey],
        );

        const continuity = report.results.filter((r) => r.check === 'chain-continuity');
        const evmWalk = continuity.find((r) => r.subject === evm.receipt.signingKeyId);
        const solanaWalk = continuity.find((r) => r.subject === SOLANA_SIGNING_KEY_ID);

        expect(evmWalk?.ok).toBe(true);
        expect(solanaWalk?.ok).toBe(false);
        expect(solanaWalk?.detail).toMatch(/sequence-not-consecutive/);
    });

    // The receipt itself is chain-blind: same drand seed, same engine, same progression.
    // A Solana receipt failing one of those would be a bug, not a fixture difference.
    it('runs every per-receipt check on a Solana receipt too', () => {
        const solana = buildSignedReceipt({
            battleId: 'btl_sol_1',
            snapshot: SOLANA_SNAPSHOT,
            signingKeyId: SOLANA_SIGNING_KEY_ID,
        });
        const report = verifyReceipts([solana.envelope], [solana.trustedKey]);

        expect(report.results.map((r) => r.check)).toEqual(SINGLE_RECEIPT_CHECKS);
        expect(report.ok).toBe(true);
    });
});
