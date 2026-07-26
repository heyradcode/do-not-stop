#!/usr/bin/env node
import { loadReceipts, loadRulesets, loadSigningKeys } from './io';
import { pinnedRulesets } from './ruleset';
import { verifyReceipts } from './verify';

/**
 * `cryptopets-verify <receipt-file-or-url> [--keys <source>] [--rulesets <source>]`
 *
 * Prints one pass/fail line per check and exits non-zero if any check failed.
 *
 * Both flags default to the safe answer rather than the convenient one. Omitting `--keys`
 * is not "skip the signature check": it means no key is trusted, so every receipt's
 * operator-signature check fails. Omitting `--rulesets` falls back to the bundles pinned
 * into this package, so a battle fought under a ruleset nobody pinned reports
 * `ruleset-unavailable` instead of being replayed against the wrong numbers.
 */
async function main(): Promise<void> {
    // `pnpm run cli -- foo.json` forwards the `--` itself rather than consuming it, so a
    // bare separator is dropped here instead of being mistaken for the receipt source.
    const args = process.argv.slice(2).filter((arg) => arg !== '--');
    const receiptSource = args[0];
    if (!receiptSource || receiptSource.startsWith('--')) {
        console.error('usage: cryptopets-verify <receipt-file-or-url> [--keys <source>] [--rulesets <source>]');
        process.exitCode = 1;
        return;
    }

    const keysSource = flagValue(args, '--keys');
    const rulesetsSource = flagValue(args, '--rulesets');

    const envelopes = await loadReceipts(receiptSource);
    const trustedKeys = keysSource ? await loadSigningKeys(keysSource) : [];

    const rulesets = pinnedRulesets();
    if (rulesetsSource) {
        for (const [hash, ruleset] of await loadRulesets(rulesetsSource)) {
            rulesets.set(hash, ruleset);
        }
    }

    const report = verifyReceipts(envelopes, trustedKeys, { rulesets });
    for (const result of report.results) {
        const subject = result.subject ? `${result.subject} ` : '';
        console.log(`[${result.ok ? 'PASS' : 'FAIL'}] ${subject}${result.check}${result.detail ? `: ${result.detail}` : ''}`);
    }
    process.exitCode = report.ok ? 0 : 1;
}

function flagValue(args: readonly string[], flag: string): string | undefined {
    const index = args.indexOf(flag);
    if (index < 0) return undefined;
    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
        throw new Error(`${flag} needs a file path or URL`);
    }
    return value;
}

main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
