/**
 * Entry point for `pnpm warm`. Wiring and argument parsing only; the walk itself
 * is in warm.ts so it can be tested without touching a chain or a bucket.
 *
 *   pnpm warm --from=1 --to=200 --dry-run
 *   pnpm warm --from=1 --to=200
 */

import { ConfigError } from './config.js';
import { buildDeps } from './server.js';
import { ChainNotEnumerableError, formatSummary, warmPets } from './warm.js';

const arg = (name: string): string | undefined =>
    process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');

const readRange = (name: string, fallback?: number): number => {
    const raw = arg(name);
    if (raw == null) {
        if (fallback !== undefined) return fallback;
        throw new ConfigError(`--${name} is required`);
    }
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1) {
        throw new ConfigError(`--${name} must be a positive integer, got "${raw}"`);
    }
    return value;
};

const main = async (): Promise<void> => {
    const from = readRange('from', 1);
    const to = readRange('to');
    if (to < from) throw new ConfigError(`--to (${to}) is before --from (${from})`);

    const chain = arg('chain') ?? 'evm';
    const dryRun = process.argv.includes('--dry-run');

    const { deps, store } = await buildDeps();

    console.log(`warming ${chain} pets ${from}-${to}`);
    console.log(`  store   ${store}`);
    console.log(`  model   ${deps.config.model}`);
    if (dryRun) console.log('  dry run: nothing will be generated\n');
    else console.log('');

    const started = Date.now();
    const summary = await warmPets(
        { ...deps, reader: deps.reader },
        {
            chain,
            from,
            to,
            dryRun,
            // Streamed rather than held to the end: a long paid run should show
            // what it is doing while it does it.
            onProgress: (event) => {
                if (event.outcome !== 'missing') {
                    console.log(`  ${event.tokenId.padStart(8)}  ${event.outcome}${event.error ? `: ${event.error}` : ''}`);
                }
            },
        },
    );

    console.log(`\n${formatSummary(summary, Date.now() - started)}`);
    // A run with failures exits non-zero so it can be retried from a script
    // without parsing the output.
    if (summary.failed > 0) process.exitCode = 1;
};

main().catch((error: unknown) => {
    console.error(error instanceof ConfigError || error instanceof ChainNotEnumerableError ? error.message : error);
    process.exitCode = 1;
});
