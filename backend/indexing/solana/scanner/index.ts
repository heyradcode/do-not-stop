import { upsertPet } from '@repositories/roster.repository';
import { createHeliusRpc } from './rpc';

export { createHeliusRpc } from './rpc';
export type { HeliusRpc } from './rpc';
export { decodePetAccount } from './decode';

/**
 * Solana roster source: full reconciliation scan over Helius RPC. The webhook
 * (../webhooks) keeps `pet_roster` fresh in near-real-time; this periodic scan
 * is the backfill + safety net for any missed delivery.
 *
 * `getProgramAccounts` returns every `PetAccount`, so each pass is a complete
 * resync — no cursor/pagination needed (the roster is small and bounded).
 */
export interface SolanaIndexerConfig {
    /** Full Helius RPC URL, including the `?api-key=` query param. */
    rpcUrl: string;
    /** CryptoPets program id (base58) whose accounts we index. */
    programId: string;
}

export async function scanSolanaRoster(
    config: SolanaIndexerConfig
): Promise<{ scanned: number }> {
    const rpc = createHeliusRpc(config.rpcUrl, config.programId);
    const pets = await rpc.getProgramPets();

    for (const pet of pets) {
        await upsertPet(pet);
    }

    return { scanned: pets.length };
}
