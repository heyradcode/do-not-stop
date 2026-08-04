import * as grpc from '@grpc/grpc-js';
import { env } from '@config/env';
import { loadGameDataService } from './gameData';
import { createCircuitBreaker } from './circuitBreaker';
import type { RosterPet } from '@repositories/roster.repository';
import { mapPetWireToRosterPet, type PetWire } from '@repositories/roster.mapping';
import type { Chain } from '@typings/chain';

/**
 * gRPC-backed roster reads from indexer-go's write-through cache. Fail-open by contract:
 * every error, timeout, or UNAVAILABLE returns null and the caller falls back to Prisma —
 * killing indexer-go must never take reads down. A small circuit breaker stops a dead Go
 * process from adding the deadline to every read.
 *
 * Only the single-pet read is left. Matchmaking stopped using the cache when it began
 * banding on backend progression (`roster.repository.ts`), which the cache cannot see, so
 * `ListReadyOpponents` was dropped from the proto contract entirely.
 */

/** Per-call deadline. The cache answers from RAM; anything slower is a fault. */
const DEADLINE_MS = 50;
/** Consecutive failures before the breaker opens. */
const BREAKER_THRESHOLD = 3;
/** How long an open breaker skips gRPC before probing again. */
const BREAKER_COOLDOWN_MS = 30_000;

type RosterClient = grpc.Client & {
    getPetState(
        request: Record<string, unknown>,
        options: grpc.CallOptions,
        // PetResponse carries the PetWire fields plus `version`, which we drop.
        callback: (err: grpc.ServiceError | null, res: PetWire) => void,
    ): void;
};

let client: RosterClient | null = null;
const breaker = createCircuitBreaker({
    threshold: BREAKER_THRESHOLD,
    cooldownMs: BREAKER_COOLDOWN_MS,
    label: '[roster-grpc]',
});

function getClient(): RosterClient | null {
    const { addr } = env.indexerGrpc;
    if (!addr) return null;
    if (!client) {
        const Service = loadGameDataService();
        client = new Service(addr, grpc.credentials.createInsecure()) as RosterClient;
    }
    return client;
}

/**
 * Single-pet read via indexer-go (pet-detail). Fail-open: returns null whenever Prisma
 * should answer instead (feature off, breaker open, timeout, any error) or when the cache
 * has no such pet (an empty row — distinguished by the absent id).
 */
export function tryGrpcGetPetState(chain: Chain, petId: string): Promise<RosterPet | null> {
    if (env.rosterReadSource !== 'grpc' || !breaker.allows()) return Promise.resolve(null);
    const rosterClient = getClient();
    if (!rosterClient) return Promise.resolve(null);

    return new Promise((resolve) => {
        const deadline = new Date(Date.now() + DEADLINE_MS);
        rosterClient.getPetState({ chain, petId }, { deadline }, (err, res) => {
            if (err) {
                breaker.recordFailure(err.message);
                resolve(null);
                return;
            }
            breaker.recordSuccess();
            // A cache miss / unknown pet comes back as a defaulted (empty) row;
            // fall through to Prisma rather than returning a blank pet.
            resolve(res.petId ? mapPetWireToRosterPet(res) : null);
        });
    });
}
