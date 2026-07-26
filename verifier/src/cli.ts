#!/usr/bin/env node
import { loadReceipts, loadSigningKeys } from './io';
import { verifyReceipts } from './verify';

/**
 * `cryptopets-verify <receipt-file-or-url> [--keys <keys-file-or-url>]`
 *
 * Prints one pass/fail line per check and exits non-zero if any check failed. Omitting
 * `--keys` is not "skip the signature check" — it means no key is trusted, so every
 * receipt's operator-signature check fails closed rather than silently passing.
 */
async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const receiptSource = args[0];
    if (!receiptSource) {
        console.error('usage: cryptopets-verify <receipt-file-or-url> [--keys <keys-file-or-url>]');
        process.exitCode = 1;
        return;
    }
    const keysFlagIndex = args.indexOf('--keys');
    const keysSource = keysFlagIndex >= 0 ? args[keysFlagIndex + 1] : undefined;

    const envelopes = await loadReceipts(receiptSource);
    const trustedKeys = keysSource ? await loadSigningKeys(keysSource) : [];

    const report = verifyReceipts(envelopes, trustedKeys);
    for (const result of report.results) {
        const status = result.ok ? 'PASS' : 'FAIL';
        console.log(`[${status}] ${result.check}${result.detail ? `: ${result.detail}` : ''}`);
    }
    process.exitCode = report.ok ? 0 : 1;
}

main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
