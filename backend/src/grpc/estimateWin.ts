import * as grpc from '@grpc/grpc-js';
import { env } from '@config/env';
import { loadGameDataService } from './gameData';
import type { Chain } from '@typings/chain';

/**
 * EstimateWin client: pre-fight win odds from indexer-go's round-based combat
 * sim run over the warm roster cache (plan §3.3). Fail-open by contract — every
 * error, timeout, or UNAVAILABLE (cold cache) returns null so the client shows
 * "odds unavailable" rather than erroring the matchup page. Unlike the roster
 * read there is no Prisma fallback: the sim lives in indexer-go, so when the
 * link is off or down the estimate is simply omitted. A small circuit breaker
 * keeps a dead Go process from adding the deadline to every call.
 */

/**
 * Per-call deadline. Larger than the 50ms roster read: this samples the sim
 * over many seeds rather than answering from RAM, so it needs more headroom.
 */
const DEADLINE_MS = 250;
/** Consecutive failures before the breaker opens. */
const BREAKER_THRESHOLD = 3;
/** How long an open breaker skips gRPC before probing again. */
const BREAKER_COOLDOWN_MS = 30_000;

export interface EstimateWinParams {
    chain: Chain;
    petId1: string;
    petId2: string;
    /** Seeds to sample; omit / 0 lets the server pick its default. */
    samples?: number;
}

export interface WinEstimate {
    /** pet1's win probability in [0,1]. */
    winProbability: number;
    /** Seeds actually sampled by the sim. */
    samples: number;
}

/** Wire shape: double stays a number; uint32 samples stays a number. */
interface WinWire {
    winProbability: number;
    samples: number;
}

type EstimateClient = grpc.Client & {
    estimateWin(
        request: Record<string, unknown>,
        options: grpc.CallOptions,
        callback: (err: grpc.ServiceError | null, res: WinWire) => void,
    ): void;
};

let client: EstimateClient | null = null;
let consecutiveFailures = 0;
let breakerOpenUntil = 0;

function getClient(): EstimateClient | null {
    const { addr } = env.indexerGrpc;
    if (!addr) return null;
    if (!client) {
        const Service = loadGameDataService();
        client = new Service(addr, grpc.credentials.createInsecure()) as EstimateClient;
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
        console.warn(`[estimate-grpc] breaker open for ${BREAKER_COOLDOWN_MS}ms (${reason})`);
    }
}

/**
 * Pre-fight win estimate via indexer-go. Returns null whenever the estimate
 * should be omitted instead of shown (link off, breaker open, timeout, cold
 * cache / any error) — the matchup page degrades to "odds unavailable".
 */
export function tryGrpcEstimateWin(params: EstimateWinParams): Promise<WinEstimate | null> {
    if (!breakerAllows()) return Promise.resolve(null);
    const estimateClient = getClient();
    if (!estimateClient) return Promise.resolve(null);

    return new Promise((resolve) => {
        const deadline = new Date(Date.now() + DEADLINE_MS);
        estimateClient.estimateWin(
            {
                chain: params.chain,
                petId1: params.petId1,
                petId2: params.petId2,
                samples: params.samples ?? 0,
            },
            { deadline },
            (err, res) => {
                if (err) {
                    recordFailure(err.message);
                    resolve(null);
                    return;
                }
                consecutiveFailures = 0;
                resolve({ winProbability: res.winProbability, samples: res.samples });
            },
        );
    });
}
