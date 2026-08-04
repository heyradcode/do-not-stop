import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { COMMITMENT_OFFSET_ROUNDS, QUICKNET, roundTime } from '@cryptopets/protocol';

vi.mock('@config/env', () => ({
    env: {
        battle: {
            deploymentId: 'base-sepolia-live',
            chainIds: ['eip155:84532'],
            drandUrls: ['https://primary.example', 'https://secondary.example'],
            drandTimeoutMs: 1000,
        },
    },
}));

import {
    chooseCommitmentRound,
    type DrandResponse,
    drandMetrics,
    fetchVerifiedRound,
    isRoundDue,
    resetDrandCache,
    resetDrandTransport,
    roundPublishTime,
    setDrandTransport,
} from '@features/battle-randomness';

/**
 * Real quicknet beacons, from the same fixtures the protocol tests use. The whole point of
 * this client is that it verifies what an endpoint returns, so serving it synthetic
 * signatures would test the plumbing while skipping the check.
 */
interface Fixture {
    quicknet: { rounds: { round: number; signature: string; randomness: string }[] };
}
const here = dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const fixture = JSON.parse(
    readFileSync(join(here, '../../../../protocol/tests/fixtures/drand.json'), 'utf8'),
) as Fixture;

const ROUND_1000 = fixture.quicknet.rounds.find((r) => r.round === 1000)!;
const ROUND_21M = fixture.quicknet.rounds.find((r) => r.round === 21000000)!;
const PUBLISHED_1000 = roundTime(QUICKNET, ROUND_1000.round);

/** A transport that answers from a per-URL script. */
function scriptedTransport(handlers: Record<string, (url: string) => Promise<DrandResponse>>) {
    const calls: string[] = [];
    const transport = async (url: string): Promise<DrandResponse> => {
        calls.push(url);
        const host = new URL(url).origin;
        const handler = handlers[host];
        if (!handler) {
            throw new Error(`no handler for ${host}`);
        }
        return handler(url);
    };
    return { transport, calls };
}

const ok = (round: { round: number; signature: string }) => async (): Promise<DrandResponse> => ({
    status: 200,
    body: { round: round.round, signature: round.signature.replace(/^0x/, '') },
});

beforeEach(() => {
    resetDrandCache();
});

afterEach(() => {
    resetDrandTransport();
});

describe('fetching a specific round', () => {
    it('verifies a real beacon and returns its randomness', async () => {
        const { transport } = scriptedTransport({ 'https://primary.example': ok(ROUND_1000) });
        setDrandTransport(transport);

        const outcome = await fetchVerifiedRound(ROUND_1000.round, PUBLISHED_1000 + 1);

        expect(outcome.status).toBe('verified');
        if (outcome.status === 'verified') {
            expect(outcome.beacon.round).toBe(ROUND_1000.round);
            expect(outcome.beacon.randomness).toBe(`0x${ROUND_1000.randomness}`);
        }
    });

    it('rejects a forged signature rather than caching it', async () => {
        // A hostile mirror gets no further than an unverified reply we discard.
        const { transport } = scriptedTransport({
            'https://primary.example': async () => ({
                status: 200,
                // Round 21000000's real signature, offered as round 1000.
                body: { round: ROUND_1000.round, signature: ROUND_21M.signature },
            }),
            'https://secondary.example': async () => ({ status: 500, body: null }),
        });
        setDrandTransport(transport);

        const outcome = await fetchVerifiedRound(ROUND_1000.round, PUBLISHED_1000 + 1);

        expect(outcome.status).toBe('unavailable');
        expect(drandMetrics().verificationFailures).toBe(1);
    });

    it('refuses a response for a different round', async () => {
        // An endpoint answering a question we did not ask is the substitution to refuse.
        const { transport } = scriptedTransport({
            'https://primary.example': ok(ROUND_21M),
            'https://secondary.example': async () => ({ status: 500, body: null }),
        });
        setDrandTransport(transport);

        const outcome = await fetchVerifiedRound(ROUND_1000.round, PUBLISHED_1000 + 1);
        expect(outcome.status).toBe('unavailable');
    });

    it('reports not-yet-published without contacting any endpoint', async () => {
        const { transport, calls } = scriptedTransport({});
        setDrandTransport(transport);

        expect(await fetchVerifiedRound(ROUND_1000.round, PUBLISHED_1000 - 1)).toEqual({
            status: 'not-yet-published',
        });
        expect(calls).toEqual([]);
    });

    it('falls back to the next endpoint, then reports unavailable', async () => {
        const { transport, calls } = scriptedTransport({
            'https://primary.example': async () => {
                throw new Error('connect ETIMEDOUT');
            },
            'https://secondary.example': ok(ROUND_1000),
        });
        setDrandTransport(transport);

        const outcome = await fetchVerifiedRound(ROUND_1000.round, PUBLISHED_1000 + 1);
        expect(outcome.status).toBe('verified');
        expect(calls).toHaveLength(2);
        expect(drandMetrics().transportFailures).toBe(1);
    });

    it('treats a 404 past publish time as still waiting, not as a reason to move on', async () => {
        const { transport } = scriptedTransport({
            'https://primary.example': async () => ({ status: 404, body: null }),
            'https://secondary.example': async () => ({ status: 404, body: null }),
        });
        setDrandTransport(transport);

        const outcome = await fetchVerifiedRound(ROUND_1000.round, PUBLISHED_1000 + 1);
        expect(outcome.status).toBe('unavailable');
        if (outcome.status === 'unavailable') {
            expect(outcome.detail).toContain('404');
        }
    });

    it('offers no outcome that names a different round', async () => {
        // The property §E requires, asserted structurally: a caller handling a failure has
        // nothing to reach for except the same round number again.
        const { transport } = scriptedTransport({
            'https://primary.example': async () => ({ status: 500, body: null }),
            'https://secondary.example': async () => ({ status: 500, body: null }),
        });
        setDrandTransport(transport);

        const outcome = await fetchVerifiedRound(ROUND_1000.round, PUBLISHED_1000 + 1);
        expect(JSON.stringify(outcome)).not.toContain(String(ROUND_1000.round + 1));
        expect(Object.keys(outcome)).not.toContain('beacon');
    });
});

describe('caching', () => {
    it('serves a repeated round from cache without a second request', async () => {
        // Rounds are immutable, so a cached round needs no expiry.
        const { transport, calls } = scriptedTransport({ 'https://primary.example': ok(ROUND_1000) });
        setDrandTransport(transport);

        await fetchVerifiedRound(ROUND_1000.round, PUBLISHED_1000 + 1);
        await fetchVerifiedRound(ROUND_1000.round, PUBLISHED_1000 + 9);

        expect(calls).toHaveLength(1);
        expect(drandMetrics().cacheHits).toBe(1);
    });

    it('caches only what verified', async () => {
        const { transport, calls } = scriptedTransport({
            'https://primary.example': async () => ({
                status: 200,
                body: { round: ROUND_1000.round, signature: ROUND_21M.signature },
            }),
            'https://secondary.example': async () => ({ status: 500, body: null }),
        });
        setDrandTransport(transport);

        await fetchVerifiedRound(ROUND_1000.round, PUBLISHED_1000 + 1);
        await fetchVerifiedRound(ROUND_1000.round, PUBLISHED_1000 + 1);

        expect(calls).toHaveLength(4);
        expect(drandMetrics().cacheHits).toBe(0);
    });
});

describe('metrics', () => {
    it('records how far behind publication the first read was', async () => {
        const { transport } = scriptedTransport({ 'https://primary.example': ok(ROUND_1000) });
        setDrandTransport(transport);

        await fetchVerifiedRound(ROUND_1000.round, PUBLISHED_1000 + 4);

        expect(drandMetrics().lastFetchDelaySeconds).toBe(4);
        expect(drandMetrics().maxFetchDelaySeconds).toBe(4);
    });
});

describe('choosing a commitment round', () => {
    it('is the latest verified round plus the fixed offset', async () => {
        const { transport } = scriptedTransport({ 'https://primary.example': ok(ROUND_1000) });
        setDrandTransport(transport);

        const chosen = await chooseCommitmentRound(PUBLISHED_1000 + 1);

        expect(chosen).toEqual({
            ok: true,
            round: ROUND_1000.round + COMMITMENT_OFFSET_ROUNDS,
            latestVerified: ROUND_1000.round,
        });
    });

    it('fails closed when drand is unreachable', async () => {
        // A clock running behind would make a clock-derived round land in the past, which is
        // exactly what commit-before-reveal forbids. Waiting is the safe direction.
        const { transport } = scriptedTransport({
            'https://primary.example': async () => {
                throw new Error('offline');
            },
            'https://secondary.example': async () => ({ status: 503, body: null }),
        });
        setDrandTransport(transport);

        const chosen = await chooseCommitmentRound(PUBLISHED_1000 + 1);
        expect(chosen.ok).toBe(false);
    });

    it('uses the clock when it is ahead of the endpoint, so the round is future by both', async () => {
        const { transport } = scriptedTransport({ 'https://primary.example': ok(ROUND_1000) });
        setDrandTransport(transport);

        const muchLater = roundTime(QUICKNET, ROUND_1000.round + 100);
        const chosen = await chooseCommitmentRound(muchLater);

        expect(chosen.ok).toBe(true);
        if (chosen.ok) {
            expect(chosen.round).toBe(ROUND_1000.round + 100 + COMMITMENT_OFFSET_ROUNDS);
        }
    });

    it('always names a round that has not published yet', async () => {
        const { transport } = scriptedTransport({ 'https://primary.example': ok(ROUND_1000) });
        setDrandTransport(transport);

        for (const offset of [0, 1, 2]) {
            resetDrandCache();
            const now = PUBLISHED_1000 + offset;
            const chosen = await chooseCommitmentRound(now);
            expect(chosen.ok).toBe(true);
            if (chosen.ok) {
                expect(roundTime(QUICKNET, chosen.round)).toBeGreaterThan(now);
            }
        }
    });
});

describe('scheduling helpers', () => {
    it('reports when a round is due', () => {
        expect(isRoundDue(ROUND_1000.round, PUBLISHED_1000 - 1)).toBe(false);
        expect(isRoundDue(ROUND_1000.round, PUBLISHED_1000)).toBe(true);
    });

    it('gives the publish time as a Date, for an outbox retry', () => {
        expect(roundPublishTime(ROUND_1000.round)).toEqual(new Date(PUBLISHED_1000 * 1000));
    });
});
