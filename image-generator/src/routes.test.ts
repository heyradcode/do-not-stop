import { describe, expect, it, vi } from 'vitest';
import { UnknownPetError, UnsupportedChainError, type OnChainPet, type PetReader } from './chain.js';
import type { WorkersAiConfig } from './config.js';
import type { PetMetadata } from './metadata.js';
import type { PipelineDeps } from './pipeline.js';
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
};

const PET: OnChainPet = {
    tokenId: 7n,
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
    generate: (async () => Buffer.from('png-bytes')) as unknown as PipelineDeps['generate'],
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
        const d = deps({ generate: generate as unknown as PipelineDeps['generate'] });

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
            deps({ reader: reader(new UnknownPetError(999n)) }),
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
                    throw new WorkersAiError('quota exceeded', 429);
                }) as unknown as PipelineDeps['generate'],
            }),
            'GET',
            '/image/evm/7.png',
        );

        expect(response.status).toBe(502);
        expect(parse<{ error: string }>(response.body).error).toContain('quota exceeded');
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
        await handleRequest(deps({ generate: generate as unknown as PipelineDeps['generate'] }), 'GET', '/metadata/evm/7');

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
            deps({ reader: reader(new UnknownPetError(999n)) }),
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

    it('404s unknown paths and malformed token ids', async () => {
        for (const path of [
            '/nope',
            '/image/evm/7',
            '/image/evm/abc.png',
            '/image/evm/-1.png',
            '/metadata/evm/1.5',
            '/metadata/evm',
        ]) {
            expect((await handleRequest(deps(), 'GET', path)).status).toBe(404);
        }
    });
});
