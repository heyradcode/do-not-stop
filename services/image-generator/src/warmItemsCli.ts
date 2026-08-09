/**
 * Entry point for `pnpm warm:items`. Wiring and argument parsing only; the walk itself is in
 * warmItems.ts so it can be tested without touching a bucket or Workers AI.
 *
 *   pnpm warm:items --dry-run
 *   pnpm warm:items
 *
 * No range to pass, unlike `pnpm warm`: the catalog is a fixed list, so warming means all of
 * it. Safe to re-run — anything already in the store is reported as cached and skipped.
 */

import { ConfigError } from './config.js';
import { buildDeps } from './server.js';
import { formatItemSummary, warmItems } from './warmItems.js';

const main = async (): Promise<void> => {
    const dryRun = process.argv.includes('--dry-run');
    const { deps, store } = await buildDeps();

    console.log('warming the item catalog');
    console.log(`  store   ${store}`);
    console.log(`  model   ${deps.config.model}`);
    if (dryRun) console.log('  dry run: nothing will be generated\n');
    else console.log('');

    const started = Date.now();
    const summary = await warmItems(deps, {
        dryRun,
        // Streamed rather than held to the end: a paid run should show what it is doing
        // while it does it.
        onProgress: (event) => {
            const label = `${event.itemType.padStart(4)}  ${event.name.padEnd(18)}`;
            console.log(`  ${label} ${event.outcome}${event.error ? `: ${event.error}` : ''}`);
        },
    });

    console.log(`\n${formatItemSummary(summary, Date.now() - started)}`);
    // Non-zero on failures so a deploy script can retry without parsing output.
    if (summary.failed > 0) process.exitCode = 1;
};

main().catch((error: unknown) => {
    console.error(error instanceof ConfigError ? error.message : error);
    process.exitCode = 1;
});
