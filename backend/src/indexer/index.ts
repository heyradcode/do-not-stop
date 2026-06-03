import { scanSubgraphRoster } from './subgraph';
import { scanSolanaRoster } from './solana';
import { env } from '@config/env';
import { countByChain } from '@repositories/roster.repository';
import type { Chain } from '@typings/chain';

/**
 * A roster source per chain. EVM uses a Substreams-powered subgraph on The
 * Graph; Solana reconciles `PetAccount` state directly over Helius RPC (the
 * Helius webhook in src/features/webhooks handles real-time updates, this is
 * the periodic backfill/safety-net). Both keep the `pet_roster` table fresh.
 */
type RosterSource =
    | { chain: 'evm'; kind: 'subgraph'; url: string }
    | { chain: 'solana'; kind: 'helius'; rpcUrl: string; programId: string };

interface IndexerConfig {
    enabled: boolean;
    intervalMs: number;
    sources: RosterSource[];
}

const DEFAULT_INTERVAL_MS = 30_000;

function readConfig(): IndexerConfig {
    const enabled = (process.env.INDEXER_ENABLED ?? 'true').toLowerCase() !== 'false';
    const parsedInterval = Number(process.env.INDEXER_INTERVAL_MS);
    const intervalMs =
        Number.isFinite(parsedInterval) && parsedInterval > 0 ? parsedInterval : DEFAULT_INTERVAL_MS;

    const sources: RosterSource[] = [];

    const evmUrl =
        process.env.SUBGRAPH_URL_EVM?.trim() ?? process.env.SUBGRAPH_URL?.trim();
    if (evmUrl) {
        sources.push({ chain: 'evm', kind: 'subgraph', url: evmUrl });
    }

    const { heliusRpcUrl, programId } = env.solana;
    if (heliusRpcUrl && programId) {
        sources.push({ chain: 'solana', kind: 'helius', rpcUrl: heliusRpcUrl, programId });
    }

    return { enabled, intervalMs, sources };
}

function scanSource(source: RosterSource): Promise<{ scanned: number }> {
    if (source.kind === 'helius') {
        return scanSolanaRoster({ rpcUrl: source.rpcUrl, programId: source.programId });
    }
    return scanSubgraphRoster({ chain: source.chain, url: source.url });
}

/**
 * Run a single scan of every configured source. Used by the timer and the CLI.
 * Each chain runs independently — one chain failing doesn't skip the other.
 */
export async function runOnce(): Promise<void> {
    const config = readConfig();
    const failures: string[] = [];

    for (const source of config.sources) {
        try {
            const { scanned } = await scanSource(source);
            const inDb = await countByChain(source.chain);
            console.log(
                `[indexer] ${source.chain} (${source.kind}): scanned ${scanned} pets; roster now has ${inDb}`
            );
        } catch (err) {
            failures.push(`${source.chain}: ${(err as Error).message}`);
        }
    }

    if (failures.length > 0) {
        throw new Error(failures.join(' | '));
    }
}

let timer: NodeJS.Timeout | null = null;
let running = false;

/**
 * Start the background roster indexer. Call once after the server boots.
 */
export function startIndexers(): void {
    const config = readConfig();

    if (!config.enabled) {
        console.log('[indexer] disabled (INDEXER_ENABLED=false)');
        return;
    }
    if (config.sources.length === 0) {
        console.log(
            '[indexer] no sources configured (set SUBGRAPH_URL_EVM and/or HELIUS_RPC_URL + SOLANA_PROGRAM_ID); not starting'
        );
        return;
    }

    const tick = async (): Promise<void> => {
        if (running) return;
        running = true;
        try {
            await runOnce();
        } catch (err) {
            console.error('[indexer] scan failed:', (err as Error).message);
        } finally {
            running = false;
        }
    };

    const sources = config.sources.map((s) => `${s.chain}:${s.kind}`).join(', ');
    console.log(`[indexer] starting (${sources}); interval ${config.intervalMs}ms`);
    void tick();
    timer = setInterval(() => void tick(), config.intervalMs);
}

export function stopIndexers(): void {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
}
