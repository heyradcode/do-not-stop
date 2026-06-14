import * as grpc from '@grpc/grpc-js';
import { env } from '@config/env';
import { loadGameDataService } from './gameData';
import type { FindOpponentsParams, RosterPet } from '@repositories/roster.repository';
import { mapPetWireToRosterPet, type PetWire } from '@repositories/roster.mapping';
import type { Chain } from '@typings/chain';

/**
 * gRPC-backed roster reads from indexer-go's write-through cache. Fail-open by
 * contract: every error, timeout, or UNAVAILABLE returns null and the caller
 * falls back to Prisma — killing indexer-go must never take reads down. A
 * small circuit breaker stops a dead Go process from adding the deadline to
 * every read.
 */

/** Per-call deadline. The cache answers from RAM; anything slower is a fault. */
const DEADLINE_MS = 50;
/** Consecutive failures before the breaker opens. */
const BREAKER_THRESHOLD = 3;
/** How long an open breaker skips gRPC before probing again. */
const BREAKER_COOLDOWN_MS = 30_000;

interface OpponentsWire {
    pets: PetWire[];
    total: number;
}

type RosterClient = grpc.Client & {
    listReadyOpponents(
        request: Record<string, unknown>,
        options: grpc.CallOptions,
        callback: (err: grpc.ServiceError | null, res: OpponentsWire) => void,
    ): void;
    getPetState(
        request: Record<string, unknown>,
        options: grpc.CallOptions,
        // PetResponse carries the PetWire fields plus `version`, which we drop.
        callback: (err: grpc.ServiceError | null, res: PetWire) => void,
    ): void;
};

let client: RosterClient | null = null;
let consecutiveFailures = 0;
let breakerOpenUntil = 0;

function getClient(): RosterClient | null {
    const { addr } = env.indexerGrpc;
    if (!addr) return null;
    if (!client) {
        const Service = loadGameDataService();
        client = new Service(addr, grpc.credentials.createInsecure()) as RosterClient;
    }
    return client;
}

function breakerAllows(): boolean {
    return Date.now() >= breakerOpenUntil;
}

function recordFailure(reason: string): void {
    consecutiveFailures += 1;
    if (consecutiveFailures >= BREAKER_THRESHOLD) {
        breakerOpenUntil = Date.now() + BREAKER_COOLDOWN_MS;
        consecutiveFailures = 0;
        console.warn(`[roster-grpc] breaker open for ${BREAKER_COOLDOWN_MS}ms (${reason})`);
    }
}

/**
 * Matchmaking read via indexer-go. Returns null whenever Prisma should answer
 * instead (feature off, breaker open, timeout, any error).
 */
export function tryGrpcFindReadyOpponents(
    params: FindOpponentsParams,
): Promise<{ rows: RosterPet[]; total: number } | null> {
    if (env.rosterReadSource !== 'grpc' || !breakerAllows()) return Promise.resolve(null);
    const rosterClient = getClient();
    if (!rosterClient) return Promise.resolve(null);

    return new Promise((resolve) => {
        const deadline = new Date(Date.now() + DEADLINE_MS);
        rosterClient.listReadyOpponents(
            {
                chain: params.chain,
                excludeOwner: params.excludeOwner,
                minLevel: params.minLevel,
                page: params.page,
                pageSize: params.pageSize,
            },
            { deadline },
            (err, res) => {
                if (err) {
                    recordFailure(err.message);
                    resolve(null);
                    return;
                }
                consecutiveFailures = 0;
                resolve({
                    rows: res.pets.map(mapPetWireToRosterPet),
                    total: res.total,
                });
            },
        );
    });
}

/**
 * Single-pet read via indexer-go (pet-detail). Same fail-open contract as the
 * matchmaking read: returns null whenever Prisma should answer instead (feature
 * off, breaker open, timeout, any error) or when the cache has no such pet (an
 * empty row — distinguished by the absent id).
 */
export function tryGrpcGetPetState(chain: Chain, petId: string): Promise<RosterPet | null> {
    if (env.rosterReadSource !== 'grpc' || !breakerAllows()) return Promise.resolve(null);
    const rosterClient = getClient();
    if (!rosterClient) return Promise.resolve(null);

    return new Promise((resolve) => {
        const deadline = new Date(Date.now() + DEADLINE_MS);
        rosterClient.getPetState({ chain, petId }, { deadline }, (err, res) => {
            if (err) {
                recordFailure(err.message);
                resolve(null);
                return;
            }
            consecutiveFailures = 0;
            // A cache miss / unknown pet comes back as a defaulted (empty) row;
            // fall through to Prisma rather than returning a blank pet.
            resolve(res.petId ? mapPetWireToRosterPet(res) : null);
        });
    });
}
