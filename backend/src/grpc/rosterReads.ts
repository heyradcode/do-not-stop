import * as grpc from '@grpc/grpc-js';
import { env } from '@config/env';
import { loadGameDataService } from './gameData';
import type { FindOpponentsParams, RosterPet } from '@repositories/roster.repository';
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

interface PetWire {
    chain: string;
    petId: string;
    owner: string;
    name: string;
    level: number;
    rarity: number;
    dna: string;
    winCount: number;
    lossCount: number;
    readyAt: string; // int64 as string ({ longs: String })
    // v2 fields. uint32 arrive as numbers; int64 cooldowns arrive as strings.
    xp: number;
    generation: number;
    parent1Id: string;
    parent2Id: string;
    breedCount: number;
    speciesId: number;
    spouseId: string;
    breedReadyAt: string;
    trainReadyAt: string;
    asset: string;
}

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
                    rows: res.pets.map((p) => ({
                        chain: p.chain as Chain,
                        petId: p.petId,
                        owner: p.owner,
                        name: p.name,
                        level: p.level,
                        rarity: p.rarity,
                        dna: p.dna,
                        winCount: p.winCount,
                        lossCount: p.lossCount,
                        readyAt: BigInt(p.readyAt),
                        xp: p.xp,
                        generation: p.generation,
                        parent1Id: p.parent1Id,
                        parent2Id: p.parent2Id,
                        breedCount: p.breedCount,
                        speciesId: p.speciesId,
                        spouseId: p.spouseId,
                        breedReadyAt: BigInt(p.breedReadyAt),
                        trainReadyAt: BigInt(p.trainReadyAt),
                        asset: p.asset,
                    })),
                    total: res.total,
                });
            },
        );
    });
}
