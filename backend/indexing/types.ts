import type { Chain } from '@typings/chain';

/**
 * One roster source, any chain. The orchestrator (src/indexer) only knows this
 * interface, so adding a chain means implementing it — no orchestrator changes.
 */
export interface RosterIndexer {
    chain: Chain;
    /** Full scan of the source. Run on startup and by the one-off CLI script. */
    scan(): Promise<{ scanned: number }>;
    /**
     * Periodic tick: incremental where the source supports it (EVM subgraph
     * watermark), a full re-scan otherwise (Solana backfill). Returns how many
     * pets were upserted so quiet ticks can skip logging.
     */
    sync(): Promise<{ synced: number }>;
}
