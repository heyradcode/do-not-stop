import { scanSubgraphRoster, syncSubgraphChanges } from './evm';
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
const stopFns: (() => void)[] = [];

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

async function logScan(chain: Chain, scanned: number): Promise<void> {
    const inDb = await countByChain(chain);
    console.log(`[indexer] ${chain}: scanned ${scanned} pets; roster now has ${inDb}`);
}

// EVM: full sync on startup, then incremental ticks (only changed pets).
function startEvmIndexer(source: Extract<RosterSource, { kind: 'subgraph' }>, intervalMs: number): void {
    let watermark = BigInt(0);

    void scanSubgraphRoster({ chain: source.chain, url: source.url })
        .then(async ({ scanned, maxUpdatedAt }) => {
            watermark = maxUpdatedAt;
            await logScan(source.chain, scanned);
        })
        .catch((err: Error) => console.error(`[indexer] ${source.chain} initial sync failed:`, err.message));

    console.log(`[indexer] ${source.chain} incremental sync every ${intervalMs}ms`);

    const timer = setInterval(() => {
        void syncSubgraphChanges({ chain: source.chain, url: source.url }, watermark)
            .then(async ({ synced, maxUpdatedAt }) => {
                watermark = maxUpdatedAt;
                if (synced > 0) await logScan(source.chain, synced);
            })
            .catch((err: Error) => console.error(`[indexer] ${source.chain} sync failed:`, err.message));
    }, intervalMs);

    stopFns.push(() => clearInterval(timer));
}

// Solana: Helius webhooks handle real-time; this is a periodic backfill safety-net.
function startSolanaIndexer(source: Extract<RosterSource, { kind: 'helius' }>, intervalMs: number): void {
    const scan = () => scanSolanaRoster({ rpcUrl: source.rpcUrl, programId: source.programId });

    void scan()
        .then(async ({ scanned }) => logScan(source.chain, scanned))
        .catch((err: Error) => console.error(`[indexer] ${source.chain} initial sync failed:`, err.message));

    console.log(`[indexer] ${source.chain} backfill every ${intervalMs}ms`);

    const timer = setInterval(() => {
        void scan()
            .then(async ({ scanned }) => logScan(source.chain, scanned))
            .catch((err: Error) => console.error(`[indexer] ${source.chain} backfill failed:`, err.message));
    }, intervalMs);

    stopFns.push(() => clearInterval(timer));
}

/** Run a one-off full scan of every source — used by the CLI script. */
export async function runOnce(): Promise<void> {
    const { sources } = readConfig();
    const failures: string[] = [];

    for (const source of sources) {
        try {
            if (source.kind === 'subgraph') {
                const { scanned } = await scanSubgraphRoster({ chain: source.chain, url: source.url });
                await logScan(source.chain, scanned);
            } else {
                const { scanned } = await scanSolanaRoster({ rpcUrl: source.rpcUrl, programId: source.programId });
                await logScan(source.chain, scanned);
            }
        } catch (err) {
            failures.push(`${source.chain}: ${(err as Error).message}`);
        }
    }

    if (failures.length > 0) throw new Error(failures.join(' | '));
}

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
        if (source.kind === 'subgraph') startEvmIndexer(source, config.intervalMs);
        else startSolanaIndexer(source, config.intervalMs);
    }
}

export function stopIndexers(): void {
    for (const stop of stopFns) stop();
    stopFns.length = 0;
}
