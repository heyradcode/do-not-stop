import { createSubgraphIndexer } from './evm';
import { createSolanaIndexer } from './solana';
import { env } from '@config/env';
import { countByChain } from '@repositories/roster.repository';
import type { Chain } from '@typings/chain';
import type { RosterIndexer } from './types';

/**
 * Orchestrates every configured roster source through the {@link RosterIndexer}
 * interface: full `scan` on startup, then `sync` ticks on an interval. Chain
 * specifics (subgraph watermark, Helius re-scan) live in the per-chain
 * factories — adding a chain means adding a factory call to `buildIndexers`.
 */

const stopFns: (() => void)[] = [];

function buildIndexers(): RosterIndexer[] {
    const indexers: RosterIndexer[] = [];

    const evmUrl = env.indexer.evmSubgraphUrl;
    if (evmUrl) indexers.push(createSubgraphIndexer({ chain: 'evm', url: evmUrl }));

    const { heliusRpcUrl, programId } = env.solana;
    if (heliusRpcUrl && programId) {
        indexers.push(createSolanaIndexer({ rpcUrl: heliusRpcUrl, programId }));
    }

    return indexers;
}

async function logScan(chain: Chain, scanned: number): Promise<void> {
    const inDb = await countByChain(chain);
    console.log(`[indexer] ${chain}: scanned ${scanned} pets; roster now has ${inDb}`);
}

function startIndexer(indexer: RosterIndexer, intervalMs: number): void {
    const { chain } = indexer;

    void indexer
        .scan()
        .then(({ scanned }) => logScan(chain, scanned))
        .catch((err: Error) => console.error(`[indexer] ${chain} initial sync failed:`, err.message));

    console.log(`[indexer] ${chain} sync every ${intervalMs}ms`);

    const timer = setInterval(() => {
        void indexer
            .sync()
            .then(async ({ synced }) => {
                if (synced > 0) await logScan(chain, synced);
            })
            .catch((err: Error) => console.error(`[indexer] ${chain} sync failed:`, err.message));
    }, intervalMs);

    stopFns.push(() => clearInterval(timer));
}

/** Run a one-off full scan of every source — used by the CLI script. */
export async function runOnce(): Promise<void> {
    const failures: string[] = [];

    for (const indexer of buildIndexers()) {
        try {
            const { scanned } = await indexer.scan();
            await logScan(indexer.chain, scanned);
        } catch (err) {
            failures.push(`${indexer.chain}: ${(err as Error).message}`);
        }
    }

    if (failures.length > 0) throw new Error(failures.join(' | '));
}

export function startIndexers(): void {
    if (!env.indexer.enabled) {
        console.log('[indexer] disabled (INDEXER_ENABLED=false)');
        return;
    }

    const indexers = buildIndexers();
    if (indexers.length === 0) {
        console.log('[indexer] no sources configured; not starting');
        return;
    }

    for (const indexer of indexers) {
        startIndexer(indexer, env.indexer.intervalMs);
    }
}

export function stopIndexers(): void {
    for (const stop of stopFns) stop();
    stopFns.length = 0;
}
