import { scanSolanaRoster, type SolanaIndexerConfig } from '@solana-indexer/scanner';
import type { RosterIndexer } from './types';

/**
 * Helius source as a {@link RosterIndexer}. The webhook keeps `pet_roster`
 * fresh in near-real-time, so `sync` is just a periodic full re-scan — the
 * backfill safety net for missed deliveries (`getProgramAccounts` returns the
 * whole bounded roster; no cursor to track).
 */
export function createSolanaIndexer(config: SolanaIndexerConfig): RosterIndexer {
    const scan = async (): Promise<{ scanned: number }> => scanSolanaRoster(config);

    return {
        chain: 'solana',
        scan,
        async sync() {
            const { scanned } = await scan();
            return { synced: scanned };
        },
    };
}
