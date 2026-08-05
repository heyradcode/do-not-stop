/**
 * Request routing, as a pure function from (method, path) to a response
 * descriptor. Kept free of node:http so every route is testable without opening
 * a socket; server.ts does the socket wiring and nothing else.
 *
 * Routes:
 *   GET /health                        liveness: process is up, touches nothing
 *   GET /ready                         readiness: store and RPC actually work
 *   GET /image/:chain/:tokenId.png     the pet's art (generated once, then cached)
 *   GET /metadata/:chain/:tokenId      ERC-721 metadata, what tokenURI points at
 */

import type { PetReader } from './chain.js';
import { UnknownPetError, UnsupportedChainError } from './chain.js';
import { buildPetMetadata } from './metadata.js';
import { getOrCreatePetImage, type PipelineDeps } from './pipeline.js';
import { petImageKey } from './store.js';
import { checkReadiness } from './readiness.js';
import { DeadlineExceeded, withDeadline } from './retry.js';
import { ChainNotConfiguredError } from './readerRouter.js';
import { ConfigError } from './config.js';
import { WorkersAiError } from './workersAi.js';

export interface RouteDeps extends PipelineDeps {
    reader: PetReader;
    /** Absolute base URL this service is reachable at, for metadata image links. */
    publicBaseUrl: string;
    /** Optional per-pet game URL template, `{chain}` and `{tokenId}` substituted. */
    externalUrlTemplate?: string;
    /** How long an image request waits for generation before giving up on the
     *  response. Generation itself is never cancelled. */
    responseTimeoutMs?: number;
    /** Chains this deployment serves, all probed by /ready. */
    probeChains?: string[];
}

export interface RouteResponse {
    status: number;
    headers: Record<string, string>;
    body: Buffer;
}

/** Art is immutable once written, so it can be cached forever by every layer.
 *  Metadata carries level and win/loss, which change, so it gets a short TTL. */
const IMMUTABLE = 'public, max-age=31536000, immutable';

/**
 * A cold gallery asks for every pet at once, and each miss is a generation
 * queued behind the concurrency limit, so the last caller can wait minutes with a
 * connection open. Browsers and proxies give up long before that. Bounding the
 * response is free because the generation continues regardless and lands in the
 * store, making the next request a hit.
 */
const DEFAULT_RESPONSE_TIMEOUT_MS = 25_000;
const SHORT_LIVED = 'public, max-age=60';
const NO_STORE = 'no-store';

const json = (status: number, value: unknown, cacheControl = NO_STORE): RouteResponse => ({
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cacheControl },
    body: Buffer.from(JSON.stringify(value, null, 2)),
});

const png = (bytes: Buffer, cached: boolean): RouteResponse => ({
    status: 200,
    headers: {
        'content-type': 'image/png',
        'cache-control': IMMUTABLE,
        'content-length': String(bytes.length),
        // Lets a deploy be checked for cache effectiveness without extra tooling.
        'x-art-cache': cached ? 'hit' : 'miss',
    },
    body: bytes,
});

// The identifier is chain-specific (decimal on EVM, a base58 Core asset pubkey on
// Solana), so the route accepts alphanumerics and the reader rejects what it cannot
// parse. Deliberately NOT the base58 alphabet, which excludes "0" and would 404
// every EVM pet whose id contains one. Bounded at 88 characters, the longest a
// base58 pubkey gets, so nothing absurd reaches a reader.
const IMAGE_ROUTE = /^\/image\/([a-z0-9-]+)\/([0-9A-Za-z]{1,88})\.png$/;
const METADATA_ROUTE = /^\/metadata\/([a-z0-9-]+)\/([0-9A-Za-z]{1,88})$/;

export const handleRequest = async (
    deps: RouteDeps,
    method: string,
    path: string,
): Promise<RouteResponse> => {
    if (method !== 'GET' && method !== 'HEAD') {
        return json(405, { error: 'Method not allowed' });
    }

    // Liveness: deliberately touches nothing external, so a platform that
    // restarts unhealthy instances never restarts one over an upstream blip.
    if (path === '/health' || path === '/') {
        return json(200, {
            status: 'ok',
            store: deps.store.constructor?.name ?? 'unknown',
            model: deps.config.model,
        });
    }

    // Readiness: proves this instance can actually serve an image. 503 on failure
    // so a deploy with bad credentials is caught at deploy time rather than by the
    // first user.
    if (path === '/ready') {
        const report = await checkReadiness(deps);
        return json(report.ready ? 200 : 503, report);
    }

    const image = IMAGE_ROUTE.exec(path);
    if (image) return await serveImage(deps, image[1]!, image[2]!, method === 'HEAD');

    const metadata = METADATA_ROUTE.exec(path);
    if (metadata) return await serveMetadata(deps, metadata[1]!, metadata[2]!);

    return json(404, { error: 'Not found' });
};

const serveImage = async (
    deps: RouteDeps,
    chain: string,
    tokenId: string,
    probeOnly: boolean,
): Promise<RouteResponse> => {
    try {
        const pet = await deps.reader.read(chain, tokenId);
        const input = {
            dna: pet.dna,
            rarity: pet.rarity,
            ...(pet.speciesId === undefined ? {} : { speciesId: pet.speciesId }),
        };

        // HEAD reports whether art is ready; it never generates. Marketplaces and
        // link previewers probe image URLs, and generating for a probe would bill
        // an inference for something nobody is looking at yet, in a burst that
        // bypasses both the client's lazy loading and the rule that metadata
        // never generates. The pet-existence read above still runs, so an
        // unminted token still answers 404.
        if (probeOnly) {
            const cached = await deps.store.get(petImageKey(input));
            return cached ? png(cached.bytes, true) : notReady();
        }

        const result = await withDeadline(
            getOrCreatePetImage(deps, input),
            deps.responseTimeoutMs ?? DEFAULT_RESPONSE_TIMEOUT_MS,
        );

        // With a public bucket the bytes never need to pass through this service.
        if (result.url) {
            return {
                status: 302,
                headers: { location: result.url, 'cache-control': IMMUTABLE },
                body: Buffer.alloc(0),
            };
        }
        return png(result.bytes, result.cached);
    } catch (error) {
        return errorResponse(error);
    }
};

const serveMetadata = async (deps: RouteDeps, chain: string, tokenId: string): Promise<RouteResponse> => {
    try {
        const pet = await deps.reader.read(chain, tokenId);
        const base = deps.publicBaseUrl.replace(/\/+$/, '');
        const metadata = buildPetMetadata(pet, {
            imageUrl: `${base}/image/${chain}/${tokenId}.png`,
            ...(deps.externalUrlTemplate
                ? {
                    externalUrl: deps.externalUrlTemplate
                        .replace('{chain}', chain)
                        .replace('{tokenId}', tokenId),
                }
                : {}),
        });

        // Metadata is served without generating the image, so a marketplace
        // indexing a whole collection does not trigger thousands of inferences at
        // once; the image is generated when it is first actually fetched.
        return json(200, metadata, SHORT_LIVED);
    } catch (error) {
        return errorResponse(error);
    }
};

/** Art exists in principle but has not been generated yet. Not an error: the
 *  caller should come back, which Retry-After tells it to do. */
const notReady = (): RouteResponse => ({
    status: 503,
    headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': NO_STORE,
        'retry-after': '30',
    },
    body: Buffer.from(JSON.stringify({ error: 'Image is not generated yet; retry shortly' }, null, 2)),
});

const errorResponse = (error: unknown): RouteResponse => {
    if (error instanceof UnknownPetError) return json(404, { error: error.message });
    if (error instanceof UnsupportedChainError) return json(400, { error: error.message });
    // A real chain this deployment just has no credentials for: an operator
    // problem, not a caller one, so 501 rather than 400.
    if (error instanceof ChainNotConfiguredError) return json(501, { error: error.message });
    if (error instanceof ConfigError) return json(500, { error: error.message });
    // Still being generated. 503 + Retry-After rather than an error: nothing is
    // wrong, the image simply is not ready yet, and it will be shortly.
    if (error instanceof DeadlineExceeded) return notReady();
    if (error instanceof WorkersAiError) {
        // Upstream generation failure. 502 keeps it distinguishable from a bad
        // request, and nothing was cached, so a retry can succeed.
        return json(502, { error: error.message });
    }
    return json(500, { error: error instanceof Error ? error.message : 'Internal error' });
};
