import { describe, expect, it, vi } from 'vitest';
import { UnknownPetError, UnsupportedChainError, type OnChainPet, type PetReader } from './chain.js';
import type { WorkersAiConfig } from './config.js';
import type { PetMetadata } from './metadata.js';
import type { PipelineDeps } from './pipeline.js';
import { ChainNotConfiguredError } from './readerRouter.js';
import { handleRequest, type RouteDeps } from './routes.js';
import { MemoryImageStore, petImageKey } from './store.js';
import { WorkersAiError } from './workersAi.js';

const CONFIG: WorkersAiConfig = {
    accountId: 'acct',
    apiToken: 'token',
    model: '@cf/bytedance/stable-diffusion-xl-lightning',
    size: 1024,
    steps: 8,
    timeoutMs: 5_000,
    attempts: 1,
    maxConcurrent: 2,
};

const PET: OnChainPet = {
    tokenId: '7',
    name: 'Sparky',
    dna: 79_34_05_61_88_13_42_07n,
    rarity: 3,
    speciesId: 6,
    level: 4,
    generation: 1,
    winCount: 3,
    lossCount: 1,
};

const reader = (pet: OnChainPet | Error = PET): PetReader => ({
    read: vi.fn(async () => {
        if (pet instanceof Error) throw pet;
        return pet;
    }),
});

const deps = (overrides: Partial<RouteDeps> = {}): RouteDeps => ({
    config: CONFIG,
    store: new MemoryImageStore(),
    generate: (async () => Buffer.from('png-bytes')) as unknown as NonNullable<PipelineDeps['generate']>,
    reader: reader(),
    publicBaseUrl: 'https://art.example.com',
    ...overrides,
});

const parse = <T>(body: Buffer): T => JSON.parse(body.toString()) as T;

describe('GET /health', () => {
    it('reports the store and model in use', async () => {
        const response = await handleRequest(deps(), 'GET', '/health');

        expect(response.status).toBe(200);
        expect(parse<{ status: string; model: string }>(response.body)).toMatchObject({
            status: 'ok',
            model: CONFIG.model,
        });
        expect(response.headers['cache-control']).toBe('no-store');
    });
});

describe('GET /ready', () => {
    it('answers 200 when the dependencies respond', async () => {
        const response = await handleRequest(deps(), 'GET', '/ready');

        expect(response.status).toBe(200);
        expect(parse<{ ready: boolean }>(response.body).ready).toBe(true);
    });

    // A deploy with bad credentials must fail its readiness gate rather than
    // going live and 500-ing on the first image.
    it('answers 503 and names the failing dependency', async () => {
        const response = await handleRequest(
            deps({ reader: reader(new Error('fetch failed: ECONNREFUSED')) }),
            'GET',
            '/ready',
        );

        expect(response.status).toBe(503);
        const report = parse<{ ready: boolean; checks: { name: string; ok: boolean }[] }>(response.body);
        expect(report.ready).toBe(false);
        expect(report.checks.find((c) => c.name === 'chain')?.ok).toBe(false);
    });

    it('is never cached, unlike the image routes', async () => {
        expect((await handleRequest(deps(), 'GET', '/ready')).headers['cache-control']).toBe('no-store');
    });

    // Liveness must not depend on anything external, or a platform that restarts
    // unhealthy instances would restart them over an upstream blip.
    it('does not affect /health, which stays up when a dependency is down', async () => {
        const broken = deps({ reader: reader(new Error('ECONNREFUSED')) });
        expect((await handleRequest(broken, 'GET', '/health')).status).toBe(200);
    });
});

describe('GET /image/:chain/:tokenId.png', () => {
    it('generates on first request and serves bytes with an immutable cache header', async () => {
        const response = await handleRequest(deps(), 'GET', '/image/evm/7.png');

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toBe('image/png');
        expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
        expect(response.headers['x-art-cache']).toBe('miss');
        expect(response.body.toString()).toBe('png-bytes');
    });

    it('reports a cache hit on the second request without regenerating', async () => {
        const generate = vi.fn(async () => Buffer.from('png-bytes'));
        const d = deps({ generate: generate as unknown as NonNullable<PipelineDeps['generate']> });

        await handleRequest(d, 'GET', '/image/evm/7.png');
        const second = await handleRequest(d, 'GET', '/image/evm/7.png');

        expect(generate).toHaveBeenCalledTimes(1);
        expect(second.headers['x-art-cache']).toBe('hit');
    });

    it('redirects to the bucket when the store is public, keeping bytes out of this service', async () => {
        const store = new MemoryImageStore() as MemoryImageStore & {
            publicUrl?: (key: string) => string;
        };
        store.publicUrl = (key) => `https://cdn.example/${key}`;

        const response = await handleRequest(deps({ store }), 'GET', '/image/evm/7.png');

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe(`https://cdn.example/${petImageKey(PET)}`);
        expect(response.body).toHaveLength(0);
    });

    it('answers 404 for a pet that was never minted', async () => {
        const response = await handleRequest(
            deps({ reader: reader(new UnknownPetError('999')) }),
            'GET',
            '/image/evm/999.png',
        );

        expect(response.status).toBe(404);
    });

    it('answers 400 for a chain it cannot read', async () => {
        const response = await handleRequest(
            deps({ reader: reader(new UnsupportedChainError('solana')) }),
            'GET',
            '/image/solana/7.png',
        );

        expect(response.status).toBe(400);
        expect(parse<{ error: string }>(response.body).error).toContain('not supported yet');
    });

    it('answers 502 when generation fails upstream, so a retry is possible', async () => {
        const response = await handleRequest(
            deps({
                generate: (async () => {
                    throw new WorkersAiError('quota exceeded', { status: 429 });
                }) as unknown as NonNullable<PipelineDeps['generate']>,
            }),
            'GET',
            '/image/evm/7.png',
        );

        expect(response.status).toBe(502);
        expect(parse<{ error: string }>(response.body).error).toContain('quota exceeded');
    });

    // A cold gallery would otherwise hold a connection open for minutes while its
    // generation waits behind the concurrency limit.
    it('answers 503 with Retry-After when generation outruns the response deadline', async () => {
        const store = new MemoryImageStore();
        const response = await handleRequest(
            deps({
                store,
                responseTimeoutMs: 10,
                generate: (async () => {
                    await new Promise((r) => setTimeout(r, 60));
                    return Buffer.from('slow-bytes');
                }) as unknown as NonNullable<PipelineDeps['generate']>,
            }),
            'GET',
            '/image/evm/7.png',
        );

        expect(response.status).toBe(503);
        expect(response.headers['retry-after']).toBe('30');
        expect(response.headers['cache-control']).toBe('no-store');
    });

    // The reason bounding the response is free: the inference was paid for and
    // still completes, so nothing is wasted and the next request is a hit.
    it('lets the abandoned generation finish and land in the store', async () => {
        const store = new MemoryImageStore();
        const d = deps({
            store,
            responseTimeoutMs: 10,
            generate: (async () => {
                await new Promise((r) => setTimeout(r, 40));
                return Buffer.from('slow-bytes');
            }) as unknown as NonNullable<PipelineDeps['generate']>,
        });

        expect((await handleRequest(d, 'GET', '/image/evm/7.png')).status).toBe(503);

        await new Promise((r) => setTimeout(r, 80));
        expect((await store.get(petImageKey(PET)))?.bytes.toString()).toBe('slow-bytes');

        // And the retry the client was told to make is now a cache hit.
        const retry = await handleRequest(d, 'GET', '/image/evm/7.png');
        expect(retry.status).toBe(200);
        expect(retry.headers['x-art-cache']).toBe('hit');
    });

    it('does not treat a query string as part of the route', async () => {
        // server.ts strips the query before routing; the path itself must not match
        // with one attached, or ?v=2 would 404 instead of serving the pet.
        expect((await handleRequest(deps(), 'GET', '/image/evm/7.png?v=2')).status).toBe(404);
    });
});

describe('GET /metadata/:chain/:tokenId', () => {
    it('returns ERC-721 metadata pointing at the image route', async () => {
        const response = await handleRequest(deps(), 'GET', '/metadata/evm/7');
        const metadata = parse<PetMetadata>(response.body);

        expect(response.status).toBe(200);
        expect(metadata.name).toBe('Sparky');
        expect(metadata.image).toBe('https://art.example.com/image/evm/7.png');
        expect(metadata.description).toContain('Rare Water Phoenix');
        expect(metadata.attributes).toEqual(
            expect.arrayContaining([
                { trait_type: 'Element', value: 'Water' },
                { trait_type: 'Body', value: 'Phoenix' },
                { trait_type: 'Level', value: 4, display_type: 'number' },
            ]),
        );
    });

    it('does not generate the image, so indexing a collection costs nothing', async () => {
        const generate = vi.fn(async () => Buffer.from('png-bytes'));
        await handleRequest(deps({ generate: generate as unknown as NonNullable<PipelineDeps['generate']> }), 'GET', '/metadata/evm/7');

        expect(generate).not.toHaveBeenCalled();
    });

    it('caches briefly, because level and record change as the pet is played', async () => {
        const response = await handleRequest(deps(), 'GET', '/metadata/evm/7');
        expect(response.headers['cache-control']).toBe('public, max-age=60');
    });

    it('trims a trailing slash from the configured base URL', async () => {
        const response = await handleRequest(
            deps({ publicBaseUrl: 'https://art.example.com/' }),
            'GET',
            '/metadata/evm/7',
        );
        expect(parse<PetMetadata>(response.body).image).toBe('https://art.example.com/image/evm/7.png');
    });

    it('fills the external URL template when one is configured', async () => {
        const response = await handleRequest(
            deps({ externalUrlTemplate: 'https://cryptopets.vercel.app/{chain}/pet/{tokenId}' }),
            'GET',
            '/metadata/evm/7',
        );
        expect(parse<PetMetadata>(response.body).external_url).toBe(
            'https://cryptopets.vercel.app/evm/pet/7',
        );
    });

    it('omits external_url when no template is configured', async () => {
        const response = await handleRequest(deps(), 'GET', '/metadata/evm/7');
        expect(parse<PetMetadata>(response.body).external_url).toBeUndefined();
    });

    it('answers 404 for a pet that was never minted', async () => {
        const response = await handleRequest(
            deps({ reader: reader(new UnknownPetError('999')) }),
            'GET',
            '/metadata/evm/999',
        );
        expect(response.status).toBe(404);
    });
});

describe('routing', () => {
    it('rejects non-GET methods', async () => {
        expect((await handleRequest(deps(), 'POST', '/image/evm/7.png')).status).toBe(405);
        expect((await handleRequest(deps(), 'DELETE', '/health')).status).toBe(405);
    });

    it('allows HEAD, which marketplaces use to probe images', async () => {
        expect((await handleRequest(deps(), 'HEAD', '/image/evm/7.png')).status).toBe(200);
    });

    it('404s structurally wrong paths', async () => {
        for (const path of [
            '/nope',
            '/image/evm/7', // no .png
            '/image/evm/-1.png', // hyphen is not an identifier character
            '/metadata/evm/1.5', // nor is a dot
            '/metadata/evm', // no identifier at all
            `/image/evm/${'9'.repeat(89)}.png`, // longer than any real identifier
        ]) {
            expect((await handleRequest(deps(), 'GET', path)).status).toBe(404);
        }
    });

    // Whether an identifier is *valid* is the reader's call, not the route's: the
    // route cannot know that decimal means EVM and base58 means Solana. So
    // /image/evm/abc.png matches here and the reader rejects it, which is why this
    // asserts against a reader rather than against the pattern (EvmPetReader's own
    // rejection of non-decimal ids is covered in chain.test.ts).
    it('leaves identifier validity to the reader, surfacing its 404', async () => {
        const notFound = deps({ reader: reader(new UnknownPetError('abc')) });

        expect((await handleRequest(notFound, 'GET', '/image/evm/abc.png')).status).toBe(404);
        expect((await handleRequest(notFound, 'GET', '/metadata/evm/abc')).status).toBe(404);
    });

    it('accepts a base58 identifier, so a non-EVM chain can be added without touching the route', async () => {
        // Every character class that matters: digits, upper, lower, mixed.
        for (const id of ['7', '10', '1000000', 'So11111111111111111111111111111111111111112']) {
            expect((await handleRequest(deps(), 'GET', `/image/evm/${id}.png`)).status).toBe(200);
        }
    });

    it('answers 501 for a real chain this deployment has no reader for', async () => {
        const response = await handleRequest(
            deps({ reader: reader(new ChainNotConfiguredError('solana')) }),
            'GET',
            '/image/solana/So11111111111111111111111111111111111111112.png',
        );

        expect(response.status).toBe(501);
        expect(parse<{ error: string }>(response.body).error).toContain('not configured');
    });
});
