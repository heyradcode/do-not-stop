import { scanSubgraphRoster, syncSubgraphChanges } from './subgraph';
import { scanSolanaRoster } from '@solana/scanner';
import { env } from '@config/env';
import { countByChain } from '@repositories/roster.repository';
import type { Chain } from '@typings/chain';

type RosterSource =
    | { chain: 'evm'; kind: 'subgraph'; url: string }
    | { chain: 'solana'; kind: 'helius'; rpcUrl: string; programId: string };

interface IndexerConfig {
    enabled: boolean;
    /** Poll interval for EVM incremental sync and Solana backfill (ms). */
    intervalMs: number;
    sources: RosterSource[];
}

const DEFAULT_INTERVAL_MS = 60_000;

function readConfig(): IndexerConfig {
    const enabled = (process.env.INDEXER_ENABLED ?? 'true').toLowerCase() !== 'false';
    const parsed = Number(process.env.INDEXER_INTERVAL_MS);
    const intervalMs = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_INTERVAL_MS;

    const sources: RosterSource[] = [];

    const evmUrl = process.env.SUBGRAPH_URL_EVM?.trim() ?? process.env.SUBGRAPH_URL?.trim();
    if (evmUrl) sources.push({ chain: 'evm', kind: 'subgraph', url: evmUrl });

    const { heliusRpcUrl, programId } = env.solana;
    if (heliusRpcUrl && programId) {
        sources.push({ chain: 'solana', kind: 'helius', rpcUrl: heliusRpcUrl, programId });
    }

    return { enabled, intervalMs, sources };
}

/** Run a one-off full scan of every source — used by the CLI script. */
export async function runOnce(): Promise<void> {
    const { sources } = readConfig();
    const failures: string[] = [];

    for (const source of sources) {
        try {
            if (source.kind === 'subgraph') {
                const { scanned } = await scanSubgraphRoster({ chain: source.chain, url: source.url });
                const inDb = await countByChain(source.chain);
                console.log(`[indexer] ${source.chain}: scanned ${scanned} pets; roster now has ${inDb}`);
            } else {
                const { scanned } = await scanSolanaRoster({ rpcUrl: source.rpcUrl, programId: source.programId });
                const inDb = await countByChain(source.chain);
                console.log(`[indexer] ${source.chain}: scanned ${scanned} pets; roster now has ${inDb}`);
            }
        } catch (err) {
            failures.push(`${source.chain}: ${(err as Error).message}`);
        }
    }

    if (failures.length > 0) throw new Error(failures.join(' | '));
}

const stopFns: (() => void)[] = [];

export function startIndexers(): void {
    const config = readConfig();

    if (!config.enabled) {
        console.log('[indexer] disabled (INDEXER_ENABLED=false)');
        return;
    }
    if (config.sources.length === 0) {
        console.log('[indexer] no sources configured; not starting');
        return;
    }

    for (const source of config.sources) {
        if (source.kind === 'subgraph') {
            // EVM: full sync on startup, then incremental ticks (only changed pets).
            let watermark = BigInt(0);

            void scanSubgraphRoster({ chain: source.chain, url: source.url })
                .then(async ({ scanned, maxUpdatedAt }) => {
                    watermark = maxUpdatedAt;
                    const inDb = await countByChain(source.chain);
                    console.log(`[indexer] ${source.chain} initial sync: ${scanned} pets; roster now has ${inDb}`);
                })
                .catch((err: Error) =>
                    console.error(`[indexer] ${source.chain} initial sync failed:`, err.message)
                );

            console.log(`[indexer] ${source.chain} incremental sync every ${config.intervalMs}ms`);

            const timer = setInterval(() => {
                void syncSubgraphChanges({ chain: source.chain, url: source.url }, watermark)
                    .then(async ({ synced, maxUpdatedAt }) => {
                        watermark = maxUpdatedAt;
                        if (synced > 0) {
                            const inDb = await countByChain(source.chain);
                            console.log(`[indexer] ${source.chain} sync: ${synced} changed; roster now has ${inDb}`);
                        }
                    })
                    .catch((err: Error) =>
                        console.error(`[indexer] ${source.chain} sync failed:`, err.message)
                    );
            }, config.intervalMs);

            stopFns.push(() => clearInterval(timer));
        } else {
            // Solana: Helius webhooks handle real-time; this is a periodic backfill safety-net.
            void scanSolanaRoster({ rpcUrl: source.rpcUrl, programId: source.programId })
                .then(async ({ scanned }) => {
                    const inDb = await countByChain(source.chain);
                    console.log(`[indexer] ${source.chain} initial sync: ${scanned} pets; roster now has ${inDb}`);
                })
                .catch((err: Error) =>
                    console.error(`[indexer] ${source.chain} initial sync failed:`, err.message)
                );

            console.log(`[indexer] ${source.chain} backfill every ${config.intervalMs}ms`);

            const timer = setInterval(() => {
                void scanSolanaRoster({ rpcUrl: source.rpcUrl, programId: source.programId })
                    .then(async ({ scanned }) => {
                        const inDb = await countByChain(source.chain);
                        console.log(`[indexer] ${source.chain} backfill: ${scanned} scanned; roster now has ${inDb}`);
                    })
                    .catch((err: Error) =>
                        console.error(`[indexer] ${source.chain} backfill failed:`, err.message)
                    );
            }, config.intervalMs);

            stopFns.push(() => clearInterval(timer));
        }
    }
}

export function stopIndexers(): void {
    for (const stop of stopFns) stop();
    stopFns.length = 0;
}
