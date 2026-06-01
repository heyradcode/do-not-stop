import { scanSubgraphRoster } from './subgraphIndexer';
import { countByChain } from '../repositories/roster.repository';
import type { Chain } from '../types/chain';

interface SubgraphSource {
    chain: Chain;
    url: string;
}

interface IndexerConfig {
    enabled: boolean;
    intervalMs: number;
    sources: SubgraphSource[];
}

const DEFAULT_INTERVAL_MS = 30_000;

function readSubgraphUrl(chain: Chain): string | undefined {
    if (chain === 'evm') {
        return (
            process.env.SUBGRAPH_URL_EVM?.trim() ??
            process.env.SUBGRAPH_URL?.trim()
        );
    }
    return process.env.SUBGRAPH_URL_SOLANA?.trim();
}

function readConfig(): IndexerConfig {
    const enabled = (process.env.INDEXER_ENABLED ?? 'true').toLowerCase() !== 'false';
    const parsedInterval = Number(process.env.INDEXER_INTERVAL_MS);
    const intervalMs =
        Number.isFinite(parsedInterval) && parsedInterval > 0 ? parsedInterval : DEFAULT_INTERVAL_MS;

    const sources: SubgraphSource[] = [];
    const evmUrl = readSubgraphUrl('evm');
    const solanaUrl = readSubgraphUrl('solana');

    if (evmUrl) {
        sources.push({ chain: 'evm', url: evmUrl });
    }
    if (solanaUrl) {
        sources.push({ chain: 'solana', url: solanaUrl });
    }

    return { enabled, intervalMs, sources };
}

/**
 * Run a single scan of every configured subgraph. Used by the timer and the CLI.
 * Each chain runs independently — one chain failing doesn't skip the other.
 */
export async function runOnce(): Promise<void> {
    const config = readConfig();
    const failures: string[] = [];

    for (const source of config.sources) {
        try {
            const { scanned } = await scanSubgraphRoster({
                chain: source.chain,
                url: source.url,
            });
            const inDb = await countByChain(source.chain);
            console.log(
                `[indexer] ${source.chain} (subgraph): scanned ${scanned} pets; roster now has ${inDb}`
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
            '[indexer] no subgraph URLs configured (set SUBGRAPH_URL_EVM and/or SUBGRAPH_URL_SOLANA); not starting'
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

    const chains = config.sources.map((s) => s.chain).join(', ');
    console.log(`[indexer] starting (subgraph: ${chains}); interval ${config.intervalMs}ms`);
    void tick();
    timer = setInterval(() => void tick(), config.intervalMs);
}

export function stopIndexers(): void {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
}
