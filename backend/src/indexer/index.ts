import { scanSubgraphRoster, subscribeSubgraphRoster } from './subgraph';
import { scanSolanaRoster } from '@solana/scanner';
import { env } from '@config/env';
import { countByChain } from '@repositories/roster.repository';
import type { Chain } from '@typings/chain';

type RosterSource =
    | { chain: 'evm'; kind: 'subgraph'; url: string; wsUrl?: string }
    | { chain: 'solana'; kind: 'helius'; rpcUrl: string; programId: string };

interface IndexerConfig {
    enabled: boolean;
    /** Backfill interval for Solana (ms). EVM uses subscription instead. */
    solanaBackfillMs: number;
    sources: RosterSource[];
}

const DEFAULT_SOLANA_BACKFILL_MS = 5 * 60 * 1000; // 5 minutes

function readConfig(): IndexerConfig {
    const enabled = (process.env.INDEXER_ENABLED ?? 'true').toLowerCase() !== 'false';
    const parsed = Number(process.env.INDEXER_INTERVAL_MS);
    const solanaBackfillMs =
        Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SOLANA_BACKFILL_MS;

    const sources: RosterSource[] = [];

    const evmUrl = process.env.SUBGRAPH_URL_EVM?.trim() ?? process.env.SUBGRAPH_URL?.trim();
    if (evmUrl) {
        const wsUrl = process.env.SUBGRAPH_WS_URL_EVM?.trim();
        sources.push({ chain: 'evm', kind: 'subgraph', url: evmUrl, ...(wsUrl ? { wsUrl } : {}) });
    }

    const { heliusRpcUrl, programId } = env.solana;
    if (heliusRpcUrl && programId) {
        sources.push({ chain: 'solana', kind: 'helius', rpcUrl: heliusRpcUrl, programId });
    }

    return { enabled, solanaBackfillMs, sources };
}

async function initialSync(source: RosterSource): Promise<{ chain: Chain; maxUpdatedAt: bigint }> {
    if (source.kind === 'helius') {
        const { scanned } = await scanSolanaRoster({ rpcUrl: source.rpcUrl, programId: source.programId });
        const inDb = await countByChain(source.chain);
        console.log(`[indexer] ${source.chain} initial sync: ${scanned} pets scanned; roster now has ${inDb}`);
        return { chain: source.chain, maxUpdatedAt: BigInt(0) };
    }

    const { scanned, maxUpdatedAt } = await scanSubgraphRoster({ chain: source.chain, url: source.url });
    const inDb = await countByChain(source.chain);
    console.log(`[indexer] ${source.chain} initial sync: ${scanned} pets scanned; roster now has ${inDb}`);
    return { chain: source.chain, maxUpdatedAt };
}

/** Run a one-off full scan of every source — used by the CLI script. */
export async function runOnce(): Promise<void> {
    const { sources } = readConfig();
    const failures: string[] = [];

    for (const source of sources) {
        try {
            await initialSync(source);
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
            // EVM: initial sync then subscribe for pushed updates — no polling needed.
            void (async () => {
                try {
                    const { maxUpdatedAt } = await initialSync(source);
                    console.log(`[indexer] ${source.chain} starting subscription`);
                    const stop = subscribeSubgraphRoster(
                        { chain: source.chain, url: source.url, ...(source.wsUrl ? { wsUrl: source.wsUrl } : {}) },
                        maxUpdatedAt,
                    );
                    stopFns.push(stop);
                } catch (err) {
                    console.error(`[indexer] ${source.chain} initial sync failed:`, (err as Error).message);
                }
            })();
        } else {
            // Solana: Helius webhooks handle real-time updates; this is a periodic backfill safety-net.
            console.log(`[indexer] ${source.chain} backfill every ${config.solanaBackfillMs}ms`);
            void initialSync(source).catch((err) =>
                console.error(`[indexer] ${source.chain} initial sync failed:`, (err as Error).message)
            );

            const timer = setInterval(() => {
                void scanSolanaRoster({ rpcUrl: source.rpcUrl, programId: source.programId })
                    .then(async ({ scanned }) => {
                        const inDb = await countByChain(source.chain);
                        console.log(`[indexer] ${source.chain} backfill: ${scanned} scanned; roster now has ${inDb}`);
                    })
                    .catch((err) => console.error(`[indexer] ${source.chain} backfill failed:`, (err as Error).message));
            }, config.solanaBackfillMs);

            stopFns.push(() => clearInterval(timer));
        }
    }
}

export function stopIndexers(): void {
    for (const stop of stopFns) stop();
    stopFns.length = 0;
}
