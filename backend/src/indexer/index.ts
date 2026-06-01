import { scanEvmRoster } from './evmIndexer';
import { scanSubgraphRoster } from './subgraphIndexer';
import { countByChain } from './rosterRepository';

/** Where EVM roster data comes from. Subgraph is preferred when configured. */
type EvmSource =
    | { kind: 'subgraph'; url: string }
    | { kind: 'rpc'; rpcUrl: string; contractAddress: string };

interface IndexerConfig {
    enabled: boolean;
    intervalMs: number;
    evm?: EvmSource;
}

const DEFAULT_INTERVAL_MS = 30_000;

function readConfig(): IndexerConfig {
    const enabled = (process.env.INDEXER_ENABLED ?? 'true').toLowerCase() !== 'false';
    const parsedInterval = Number(process.env.INDEXER_INTERVAL_MS);
    const intervalMs =
        Number.isFinite(parsedInterval) && parsedInterval > 0 ? parsedInterval : DEFAULT_INTERVAL_MS;

    const subgraphUrl = process.env.SUBGRAPH_URL?.trim();
    const contractAddress = process.env.EVM_CONTRACT_ADDRESS?.trim();
    const rpcUrl = process.env.EVM_RPC_URL?.trim() || 'http://localhost:8545';

    // Prefer the subgraph when set; otherwise fall back to the RPC poller.
    let evm: EvmSource | undefined;
    if (subgraphUrl) {
        evm = { kind: 'subgraph', url: subgraphUrl };
    } else if (contractAddress) {
        evm = { kind: 'rpc', rpcUrl, contractAddress };
    }

    const base = { enabled, intervalMs };
    return evm ? { ...base, evm } : base;
}

/** Run a single scan of every configured chain. Used by the timer and the CLI. */
export async function runOnce(): Promise<void> {
    const config = readConfig();

    if (config.evm) {
        if (config.evm.kind === 'subgraph') {
            const { scanned } = await scanSubgraphRoster({ url: config.evm.url });
            const inDb = await countByChain('evm');
            console.log(`[indexer] evm (subgraph): scanned ${scanned} pets; roster now has ${inDb}`);
        } else {
            const { total, scanned } = await scanEvmRoster(config.evm);
            const inDb = await countByChain('evm');
            console.log(`[indexer] evm (rpc): scanned ${scanned}/${total} pets; roster now has ${inDb}`);
        }
    }
    // Solana scan slots in here once implemented (see solanaIndexer.ts).
}

let timer: NodeJS.Timeout | null = null;
let running = false;

/**
 * Start the background roster indexer. Call once after the server boots.
 * No-op in serverless (the timer would not persist) — only `server.ts` calls it.
 */
export function startIndexers(): void {
    const config = readConfig();

    if (!config.enabled) {
        console.log('[indexer] disabled (INDEXER_ENABLED=false)');
        return;
    }
    if (!config.evm) {
        console.log(
            '[indexer] no chains configured (set SUBGRAPH_URL or EVM_CONTRACT_ADDRESS); not starting'
        );
        return;
    }

    const tick = async (): Promise<void> => {
        if (running) return; // skip if the previous scan is still going
        running = true;
        try {
            await runOnce();
        } catch (err) {
            console.error('[indexer] scan failed:', (err as Error).message);
        } finally {
            running = false;
        }
    };

    console.log(`[indexer] starting (evm source: ${config.evm.kind}); interval ${config.intervalMs}ms`);
    void tick(); // run immediately on boot
    timer = setInterval(() => void tick(), config.intervalMs);
}

export function stopIndexers(): void {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
}
