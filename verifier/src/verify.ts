import { assertBattleReceipt, type BattleReceipt, receiptFromWire, type Ruleset } from '@cryptopets/protocol';

import {
    checkBeaconSignature,
    checkChainContinuity,
    checkCombatReplay,
    checkEquipment,
    checkOperatorSignature,
    checkProgression,
    checkSeedDerivation,
    type CheckResult,
} from './checks';
import { builtInRulesets, type RulesetRegistry, type SignedReceiptEnvelope, type TrustedSigningKey } from './io';

export interface VerifyOptions {
    /**
     * Published ruleset bundles, keyed by lowercase `rulesetHash`. Defaults to this build's
     * source-default ruleset alone, which covers every battle fought under untuned
     * `GameConfig` values.
     */
    rulesets?: RulesetRegistry;
}

export interface VerifyReceiptsReport {
    results: CheckResult[];
    ok: boolean;
}

/**
 * Runs every check §H item 1 calls for over a set of signed receipt envelopes: operator
 * signature, drand BLS beacon, seed derivation, combat replay, progression, and hash-chain
 * continuity across the run.
 *
 * Nothing here contacts the operator. Every input is either in the receipt itself or was
 * supplied by the caller (a trusted key list, published ruleset bundles), which is the
 * whole point — an answer that depended on the backend telling the truth would not be
 * verification.
 *
 * Every check is reported, not just the first failure. "The beacon is forged" and "the XP
 * is wrong" are different accusations, and a verifier that stopped at the first one would
 * make the second invisible.
 *
 * Two things fail closed rather than being skipped quietly:
 *
 * - A receipt that will not parse, or fails its own internal consistency
 *   (`assertBattleReceipt`), is reported as `malformed-receipt`. Only the checks that do
 *   not need a hashable receipt still run on it, and it is left out of the chain walk,
 *   which assumes well-formed members.
 * - A receipt naming a ruleset bundle the caller did not supply is reported as
 *   `ruleset-unavailable`, and its replay and progression checks do not run. Reporting
 *   those as passed would be a lie; silently omitting them would read as a clean bill of
 *   health.
 */
export function verifyReceipts(
    envelopes: readonly SignedReceiptEnvelope[],
    trustedKeys: readonly TrustedSigningKey[],
    options: VerifyOptions = {},
): VerifyReceiptsReport {
    const rulesets = options.rulesets ?? builtInRulesets();
    const results: CheckResult[] = [];
    const wellFormed: BattleReceipt[] = [];

    for (const envelope of envelopes) {
        results.push(...verifyOne(envelope, trustedKeys, rulesets, wellFormed));
    }


    for (const [signingKeyId, run] of groupBySigningKey(wellFormed)) {
        results.push({ ...checkChainContinuity(run), subject: signingKeyId });
    }

    return { results, ok: results.every((result) => result.ok) };
}

/**
 * Receipts split into one run per signing key, in the order they arrived.
 *
 * There is one hash chain per *key*, not per corpus. §G gives each reward domain its own
 * key and the backend refuses to start a multi-family deployment that shares one, so a
 * deployment serving EVM and Solana signs under two — and any export spanning both, such as
 * the per-wallet and per-pet corpus views, carries receipts from each.
 *
 * Walking that as a single chain reported `mixed-signing-key` at the first receipt of the
 * second key: a failure, against an honest operator, for the ordinary dual-chain case. For a
 * tool whose whole purpose is to substantiate accusations, a false one is the worst
 * available answer.
 *
 * Input order is preserved within each key rather than sorted by sequence. An export that
 * arrives out of order *should* fail the walk, and sorting here would repair the evidence
 * before looking at it.
 */
function groupBySigningKey(receipts: readonly BattleReceipt[]): Map<string, BattleReceipt[]> {
    const runs = new Map<string, BattleReceipt[]>();
    for (const receipt of receipts) {
        const run = runs.get(receipt.signingKeyId);
        if (run) {
            run.push(receipt);
        } else {
            runs.set(receipt.signingKeyId, [receipt]);
        }
    }
    return runs;
}

function verifyOne(
    envelope: SignedReceiptEnvelope,
    trustedKeys: readonly TrustedSigningKey[],
    rulesets: RulesetRegistry,
    wellFormed: BattleReceipt[],
): CheckResult[] {
    let converted: BattleReceipt;
    try {
        converted = receiptFromWire(envelope.payload);
    } catch (error) {
        // Not even structurally a receipt: nothing further can run against it, and there is
        // no readable battle id to attribute it to either.
        return [
            {
                check: 'malformed-receipt',
                ok: false,
                detail: (error as Error).message,
                subject: envelope.receiptHash,
            },
        ];
    }

    // Every result for this receipt is attributed to it, so a corpus of hundreds does not
    // print an anonymous wall of check names.
    const subject = typeof converted.battleId === 'string' ? converted.battleId : envelope.receiptHash;
    const about = (result: CheckResult): CheckResult => ({ ...result, subject });

    // Runs before the well-formedness gate on purpose. A chosen seed is the specific thing
    // `assertBattleReceipt` would reject, and reporting only "malformed" there would bury
    // the actual accusation under a shape complaint.
    const results: CheckResult[] = [about(checkSeedDerivation(converted))];

    let receipt: BattleReceipt;
    try {
        receipt = assertBattleReceipt(converted);
    } catch (error) {
        results.push(about({ check: 'malformed-receipt', ok: false, detail: (error as Error).message }));
        return results;
    }
    wellFormed.push(receipt);

    results.push(about(checkOperatorSignature(envelope, receipt, trustedKeys)));
    results.push(about(checkBeaconSignature(receipt)));

    const ruleset = resolveRuleset(receipt, rulesets);
    if (!ruleset) {
        results.push(
            about({
                check: 'ruleset-unavailable',
                ok: false,
                detail: `no published bundle for rulesetHash ${receipt.rulesetHash}; combat replay and progression could not be checked`,
            }),
        );
        return results;
    }
    results.push(about(checkCombatReplay(receipt, ruleset)));
    // After the replay: a mispriced item still replays perfectly, so this is what says
    // whether the numbers the replay used were the ones the items declare (roadmap §4).
    results.push(about(checkEquipment(receipt, ruleset)));
    results.push(about(checkProgression(receipt, ruleset)));
    return results;
}

function resolveRuleset(receipt: BattleReceipt, rulesets: RulesetRegistry): Ruleset | undefined {
    return rulesets.get(receipt.rulesetHash.toLowerCase());
}
