import { describe, expect, it, vi } from 'vitest';

import type { WorkersAiConfig } from './config.js';
import type { PetReader } from './chain.js';
import type { ItemMetadata } from './itemMetadata.js';
import type { PipelineDeps } from './pipeline.js';
import { handleRequest, type RouteDeps } from './routes.js';
import { MemoryImageStore } from './store.js';

const CONFIG: WorkersAiConfig = {
    accountId: 'acct',
    apiToken: 'token',
    model: '@cf/bytedance/stable-diffusion-xl-lightning',
    apiBase: 'https://api.cloudflare.com/client/v4/accounts',
    size: 1024,
    steps: 8,
    timeoutMs: 5_000,
    attempts: 1,
    maxConcurrent: 2,
};

/** Reader and generator throw: no item route may ever reach the chain or Workers AI. */
const forbiddenReader: PetReader = {
    read: vi.fn(async () => {
        throw new Error('an item route must not read the chain');
    }),
};

const deps = (overrides: Partial<RouteDeps> = {}): RouteDeps => ({
    config: CONFIG,
    store: new MemoryImageStore(),
    generate: (async () => {
        throw new Error('an item route must not generate');
    }) as unknown as NonNullable<PipelineDeps['generate']>,
    reader: forbiddenReader,
    publicBaseUrl: 'https://art.example.com',
    ...overrides,
});

const get = (path: string, overrides: Partial<RouteDeps> = {}) =>
    handleRequest(deps(overrides), 'GET', path);

/** ERC-1155 `{id}`: lowercase hex, zero-padded to 64. */
const padded = (decimal: bigint) => decimal.toString(16).padStart(64, '0');

describe('GET /items/:id.json', () => {
    it('serves metadata for a decimal id', async () => {
        const res = await get('/items/1.json');
        expect(res.status).toBe(200);
        const body = JSON.parse(res.body.toString()) as ItemMetadata;
        expect(body.name).toBe('Iron Fang');
        expect(body.image).toBe('https://art.example.com/items/1.svg');
    });

    /**
     * The one that would otherwise be invisible: ItemCore's uri() is
     * ".../items/{id}.json", and every wallet substitutes 64-char padded hex, not decimal.
     * Our own frontend uses decimal, so a route that only spoke decimal would look perfectly
     * healthy in-app and 404 in every wallet.
     */
    it('serves the same item for the padded hex form a wallet actually sends', async () => {
        const viaHex = await get(`/items/${padded(1n)}.json`);
        expect(viaHex.status).toBe(200);
        expect(JSON.parse(viaHex.body.toString())).toEqual(JSON.parse((await get('/items/1.json')).body.toString()));
    });

    it('resolves a padded id whose hex differs from its decimal spelling', async () => {
        // 100 decimal is 0x64 — a route treating the padding as decimal would answer with
        // item 100 for a request meaning item 0x64, or miss entirely.
        const res = await get(`/items/${padded(100n)}.json`);
        expect(JSON.parse(res.body.toString()).name).toBe('Lesser Tonic');
    });

    it('describes stats as boosts so a marketplace renders them as numbers', async () => {
        const body = JSON.parse((await get('/items/1.json')).body.toString()) as ItemMetadata;
        expect(body.attributes).toContainEqual({ trait_type: 'ATK', value: 4, display_type: 'boost_number' });
        expect(body.attributes).toContainEqual({ trait_type: 'Slot', value: 'Weapon' });
        expect(body.attributes).toContainEqual({ trait_type: 'Rarity', value: 'Common' });
    });

    it('omits zero stats rather than advertising "+0 DEF"', async () => {
        const body = JSON.parse((await get('/items/1.json')).body.toString()) as ItemMetadata;
        expect(body.attributes.map((a) => a.trait_type)).not.toContain('DEF');
    });

    it('describes a consumable by what it does', async () => {
        const xp = JSON.parse((await get('/items/100.json')).body.toString()) as ItemMetadata;
        expect(xp.attributes).toContainEqual({ trait_type: 'Grants XP', value: 50, display_type: 'number' });

        const cd = JSON.parse((await get('/items/110.json')).body.toString()) as ItemMetadata;
        expect(cd.attributes).toContainEqual({ trait_type: 'Effect', value: 'Clears battle cooldown' });
    });

    it('has no slot attribute for something that is not equipment', async () => {
        const body = JSON.parse((await get('/items/300.json')).body.toString()) as ItemMetadata;
        expect(body.attributes.map((a) => a.trait_type)).not.toContain('Slot');
    });

    it('links back into the game when a template is configured', async () => {
        const res = await get('/items/1.json', { itemExternalUrlTemplate: 'https://play.example.com/items/{id}' });
        expect(JSON.parse(res.body.toString()).external_url).toBe('https://play.example.com/items/1');
    });

    it('404s an item type nobody defined', async () => {
        expect((await get('/items/424242.json')).status).toBe(404);
    });
});

describe('GET /items/:id.svg', () => {
    it('serves the art as SVG', async () => {
        const res = await get('/items/3.svg');
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe('image/svg+xml; charset=utf-8');
        expect(res.body.toString()).toContain('<title>Sunder Maul</title>');
    });

    it('accepts the padded hex form too', async () => {
        expect((await get(`/items/${padded(3n)}.svg`)).status).toBe(200);
    });

    it('sets a content-length matching the bytes served', async () => {
        const res = await get('/items/3.svg');
        expect(Number(res.headers['content-length'])).toBe(res.body.length);
    });

    it('caches hard, because static art only moves on a deploy', async () => {
        expect((await get('/items/3.svg')).headers['cache-control']).toContain('immutable');
    });

    it('404s an unknown item', async () => {
        expect((await get('/items/424242.svg')).status).toBe(404);
    });
});

describe('item routes are self-contained', () => {
    // The deps above throw on both. Passing proves an item request costs no inference and
    // survives an RPC outage, which is what lets them be cached forever.
    it('never touch the chain reader or the generator', async () => {
        for (const path of ['/items/1.json', '/items/1.svg', '/items/201.json', '/items/201.svg']) {
            expect((await get(path)).status).toBe(200);
        }
        expect(forbiddenReader.read).not.toHaveBeenCalled();
    });

    it('rejects a non-GET method like every other route', async () => {
        expect((await handleRequest(deps(), 'POST', '/items/1.json')).status).toBe(405);
    });

    it('does not swallow unrelated paths', async () => {
        expect((await get('/items/')).status).toBe(404);
        expect((await get('/items/1.png')).status).toBe(404);
    });
});
