/**
 * Request routing, as a pure function from (method, path) to a response
 * descriptor. Kept free of node:http so every route is testable without opening
 * a socket; server.ts does the socket wiring and nothing else.
 *
 * Routes:
 *   GET /health
 *   GET /image/:chain/:tokenId.png     the pet's art (generated once, then cached)
 *   GET /metadata/:chain/:tokenId      ERC-721 metadata, what tokenURI points at
 */

import type { PetReader } from './chain.js';
import { UnknownPetError, UnsupportedChainError, parseTokenId } from './chain.js';
import { buildPetMetadata } from './metadata.js';
import { getOrCreatePetImage, type PipelineDeps } from './pipeline.js';
import { ConfigError } from './config.js';
import { WorkersAiError } from './workersAi.js';

export interface RouteDeps extends PipelineDeps {
    reader: PetReader;
    /** Absolute base URL this service is reachable at, for metadata image links. */
    publicBaseUrl: string;
    /** Optional per-pet game URL template, `{chain}` and `{tokenId}` substituted. */
    externalUrlTemplate?: string;
}

export interface RouteResponse {
    status: number;
    headers: Record<string, string>;
    body: Buffer;
}

/** Art is immutable once written, so it can be cached forever by every layer.
 *  Metadata carries level and win/loss, which change, so it gets a short TTL. */
const IMMUTABLE = 'public, max-age=31536000, immutable';
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

const IMAGE_ROUTE = /^\/image\/([a-z0-9-]+)\/(\d{1,78})\.png$/;
const METADATA_ROUTE = /^\/metadata\/([a-z0-9-]+)\/(\d{1,78})$/;

export const handleRequest = async (
    deps: RouteDeps,
    method: string,
    path: string,
): Promise<RouteResponse> => {
    if (method !== 'GET' && method !== 'HEAD') {
        return json(405, { error: 'Method not allowed' });
    }

    if (path === '/health' || path === '/') {
        return json(200, {
            status: 'ok',
            store: deps.store.constructor?.name ?? 'unknown',
            model: deps.config.model,
        });
    }

    const image = IMAGE_ROUTE.exec(path);
    if (image) return await serveImage(deps, image[1]!, image[2]!);

    const metadata = METADATA_ROUTE.exec(path);
    if (metadata) return await serveMetadata(deps, metadata[1]!, metadata[2]!);

    return json(404, { error: 'Not found' });
};

const serveImage = async (deps: RouteDeps, chain: string, rawTokenId: string): Promise<RouteResponse> => {
    const tokenId = parseTokenId(rawTokenId);
    if (tokenId === null) return json(400, { error: 'Invalid tokenId' });

    try {
        const pet = await deps.reader.read(chain, tokenId);
        const result = await getOrCreatePetImage(deps, {
            dna: pet.dna,
            rarity: pet.rarity,
            speciesId: pet.speciesId,
        });

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

const serveMetadata = async (deps: RouteDeps, chain: string, rawTokenId: string): Promise<RouteResponse> => {
    const tokenId = parseTokenId(rawTokenId);
    if (tokenId === null) return json(400, { error: 'Invalid tokenId' });

    try {
        const pet = await deps.reader.read(chain, tokenId);
        const base = deps.publicBaseUrl.replace(/\/+$/, '');
        const metadata = buildPetMetadata(pet, {
            imageUrl: `${base}/image/${chain}/${tokenId}.png`,
            ...(deps.externalUrlTemplate
                ? {
                    externalUrl: deps.externalUrlTemplate
                        .replace('{chain}', chain)
                        .replace('{tokenId}', String(tokenId)),
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

const errorResponse = (error: unknown): RouteResponse => {
    if (error instanceof UnknownPetError) return json(404, { error: error.message });
    if (error instanceof UnsupportedChainError) return json(400, { error: error.message });
    if (error instanceof ConfigError) return json(500, { error: error.message });
    if (error instanceof WorkersAiError) {
        // Upstream generation failure. 502 keeps it distinguishable from a bad
        // request, and nothing was cached, so a retry can succeed.
        return json(502, { error: error.message });
    }
    return json(500, { error: error instanceof Error ? error.message : 'Internal error' });
};
