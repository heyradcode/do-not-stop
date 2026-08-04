import {
    assertVerifiedBeacon,
    COMMITMENT_OFFSET_ROUNDS,
    latestRoundAt,
    QUICKNET,
    roundTime,
    type VerifiedBeacon,
} from '@cryptopets/protocol';

import { env } from '@config/env';

/**
 * drand quicknet client (§E).
 *
 * Two rules shape this module, and both are about what it must refuse to do.
 *
 * **It never substitutes a round.** Settlement asks for one specific round, by number, and
 * keeps asking. An endpoint that is down, slow, or lying can delay a battle or force a
 * forfeit; it can never move the battle onto a round whose value is already known, which is
 * the reroll this whole design exists to prevent. There is deliberately no code path from
 * "round R failed to fetch" to "use round R+1".
 *
 * **It never trusts a response.** Every beacon is BLS verified against the pinned quicknet
 * public key in `@cryptopets/protocol` before it is returned or cached, so a hostile mirror
 * gets no further than an unverified reply we discard.
 */

/** Timing and failure counts for the §J drand alerts. */
export interface DrandMetrics {
    /** Rounds served from the in-memory cache. */
    cacheHits: number;
    /** Successful verified fetches. */
    fetches: number;
    /** Responses that failed BLS verification. Non-zero here is an incident, not noise. */
    verificationFailures: number;
    /** Transport or status failures, per endpoint. */
    transportFailures: number;
    /** Seconds between a round publishing and our first verified read of it. */
    lastFetchDelaySeconds: number | null;
    maxFetchDelaySeconds: number;
}

const metrics: DrandMetrics = {
    cacheHits: 0,
    fetches: 0,
    verificationFailures: 0,
    transportFailures: 0,
    lastFetchDelaySeconds: null,
    maxFetchDelaySeconds: 0,
};

/**
 * Verified rounds, cached forever.
 *
 * A drand round is immutable: round 12345 has exactly one value for all time. So there is no
 * staleness to reason about, and a cached round needs no expiry. The cache is bounded by
 * eviction of the oldest entries rather than by time.
 */
const cache = new Map<number, VerifiedBeacon>();
const MAX_CACHED_ROUNDS = 5000;

/** The transport, injectable so tests never touch the network. */
export type DrandTransport = (url: string, timeoutMs: number) => Promise<DrandResponse>;

export interface DrandResponse {
    status: number;
    body: unknown;
}

let transport: DrandTransport = httpTransport;

/** Replaces the transport. Tests only. */
export function setDrandTransport(next: DrandTransport): void {
    transport = next;
}

/** Restores the real HTTP transport. */
export function resetDrandTransport(): void {
    transport = httpTransport;
}

/** Clears the round cache and metrics. Tests only. */
export function resetDrandCache(): void {
    cache.clear();
    metrics.cacheHits = 0;
    metrics.fetches = 0;
    metrics.verificationFailures = 0;
    metrics.transportFailures = 0;
    metrics.lastFetchDelaySeconds = null;
    metrics.maxFetchDelaySeconds = 0;
}

export function drandMetrics(): DrandMetrics {
    return { ...metrics };
}

/** Whether a round is due to have published by `nowSeconds`. */
export function isRoundDue(round: number, nowSeconds: number): boolean {
    return nowSeconds >= roundTime(QUICKNET, round);
}

/** When a round publishes, as a Date, for scheduling an outbox retry. */
export function roundPublishTime(round: number): Date {
    return new Date(roundTime(QUICKNET, round) * 1000);
}

export type FetchOutcome =
    | { status: 'verified'; beacon: VerifiedBeacon }
    /** Not published yet. Retry the same round later; never move on. */
    | { status: 'not-yet-published' }
    /** Every endpoint failed. Also retry the same round. */
    | { status: 'unavailable'; detail: string };

/**
 * Fetches one specific round and verifies it.
 *
 * Note the return shape: no variant of it offers a different round. A caller handling
 * `not-yet-published` or `unavailable` has nothing to reach for except retrying the same
 * number, which is the property §E requires and the reason this is a union rather than a
 * throw-or-value.
 */
export async function fetchVerifiedRound(round: number, nowSeconds: number): Promise<FetchOutcome> {
    const cached = cache.get(round);
    if (cached) {
        metrics.cacheHits += 1;
        return { status: 'verified', beacon: cached };
    }

    if (!isRoundDue(round, nowSeconds)) {
        return { status: 'not-yet-published' };
    }

    const failures: string[] = [];
    for (const baseUrl of env.battle.drandUrls) {
        const url = `${baseUrl}/v2/beacons/quicknet/rounds/${round}`;
        let response: DrandResponse;
        try {
            response = await transport(url, env.battle.drandTimeoutMs);
        } catch (error) {
            metrics.transportFailures += 1;
            failures.push(`${baseUrl}: ${(error as Error).message}`);
            continue;
        }
        if (response.status === 404) {
            // Published time has passed but the endpoint has not caught up. Still the same
            // round; still just wait.
            failures.push(`${baseUrl}: 404`);
            continue;
        }
        if (response.status !== 200) {
            metrics.transportFailures += 1;
            failures.push(`${baseUrl}: HTTP ${response.status}`);
            continue;
        }

        const parsed = parseRoundBody(response.body);
        if (!parsed || parsed.round !== round) {
            // An endpoint answering with a different round is answering a question we did not
            // ask, which is exactly the substitution to refuse.
            metrics.verificationFailures += 1;
            failures.push(`${baseUrl}: response was for round ${parsed?.round ?? 'unknown'}`);
            continue;
        }

        let beacon: VerifiedBeacon;
        try {
            beacon = assertVerifiedBeacon(QUICKNET, { round, signature: parsed.signature });
        } catch (error) {
            metrics.verificationFailures += 1;
            failures.push(`${baseUrl}: ${(error as Error).message}`);
            continue;
        }

        remember(round, beacon);
        recordDelay(round, nowSeconds);
        metrics.fetches += 1;
        return { status: 'verified', beacon };
    }

    return { status: 'unavailable', detail: failures.join('; ') };
}

/**
 * The round a new commitment must name: the latest verified round plus the fixed offset.
 *
 * Fails rather than falling back to a clock-derived round. A clock running behind would make
 * `latestRoundAt(now) + 2` land on a round that has already published, which is precisely the
 * situation commit-before-reveal forbids. Refusing to accept battles while drand is
 * unreachable is the safe direction: players wait, and no commitment is ever made to a value
 * somebody could already have seen.
 */
export async function chooseCommitmentRound(
    nowSeconds: number,
): Promise<{ ok: true; round: number; latestVerified: number } | { ok: false; detail: string }> {
    const latest = await fetchLatestVerifiedRound();
    if (!latest.ok) {
        return { ok: false, detail: latest.detail };
    }
    // Also guard against a local clock ahead of the beacon: take whichever base is later, so
    // the chosen round is in the future by both measures.
    const clockBase = latestRoundAt(QUICKNET, nowSeconds);
    const base = Math.max(latest.round, clockBase);
    return { ok: true, round: base + COMMITMENT_OFFSET_ROUNDS, latestVerified: latest.round };
}

/** Fetches and verifies the newest round, used only for choosing a commitment round. */
export async function fetchLatestVerifiedRound(): Promise<
    { ok: true; round: number } | { ok: false; detail: string }
> {
    const failures: string[] = [];
    for (const baseUrl of env.battle.drandUrls) {
        const url = `${baseUrl}/v2/beacons/quicknet/rounds/latest`;
        try {
            const response = await transport(url, env.battle.drandTimeoutMs);
            if (response.status !== 200) {
                metrics.transportFailures += 1;
                failures.push(`${baseUrl}: HTTP ${response.status}`);
                continue;
            }
            const parsed = parseRoundBody(response.body);
            if (!parsed) {
                metrics.verificationFailures += 1;
                failures.push(`${baseUrl}: unparseable response`);
                continue;
            }
            // Verified even though it is only used to pick a future round: an unverified
            // "latest" from a hostile mirror could otherwise steer the choice.
            const beacon = assertVerifiedBeacon(QUICKNET, { round: parsed.round, signature: parsed.signature });
            remember(beacon.round, beacon);
            metrics.fetches += 1;
            return { ok: true, round: beacon.round };
        } catch (error) {
            metrics.transportFailures += 1;
            failures.push(`${baseUrl}: ${(error as Error).message}`);
        }
    }
    return { ok: false, detail: failures.join('; ') };
}

function remember(round: number, beacon: VerifiedBeacon): void {
    cache.set(round, beacon);
    if (cache.size > MAX_CACHED_ROUNDS) {
        const oldest = cache.keys().next();
        if (!oldest.done) {
            cache.delete(oldest.value);
        }
    }
}

function recordDelay(round: number, nowSeconds: number): void {
    const delay = Math.max(0, nowSeconds - roundTime(QUICKNET, round));
    metrics.lastFetchDelaySeconds = delay;
    metrics.maxFetchDelaySeconds = Math.max(metrics.maxFetchDelaySeconds, delay);
}

/** drand v2 returns `{ round, signature }`; anything else is unusable. */
function parseRoundBody(body: unknown): { round: number; signature: `0x${string}` } | null {
    if (typeof body !== 'object' || body === null) {
        return null;
    }
    const record = body as { round?: unknown; signature?: unknown };
    if (typeof record.round !== 'number' || typeof record.signature !== 'string') {
        return null;
    }
    const signature = record.signature.startsWith('0x') ? record.signature : `0x${record.signature}`;
    return { round: record.round, signature: signature as `0x${string}` };
}

async function httpTransport(url: string, timeoutMs: number): Promise<DrandResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { signal: controller.signal });
        const body = response.status === 200 ? await response.json() : null;
        return { status: response.status, body };
    } finally {
        clearTimeout(timer);
    }
}
