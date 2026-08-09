import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { OnChainPet, PetReader } from './chain.js';
import type { WorkersAiConfig } from './config.js';
import type { PipelineDeps } from './pipeline.js';
import type { RouteDeps } from './routes.js';
import { createRequestListener } from './server.js';
import { MemoryImageStore } from './store.js';

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

const reader: PetReader = { read: async () => PET };

const deps: RouteDeps = {
    config: CONFIG,
    store: new MemoryImageStore(),
    generate: (async () => Buffer.from([0x89, 0x50, 0x4e, 0x47])) as unknown as NonNullable<PipelineDeps['generate']>,
    reader,
    publicBaseUrl: 'https://art.example.com',
};

describe('createRequestListener', () => {
    let server: Server;
    let base: string;

    beforeAll(async () => {
        server = createServer(createRequestListener(deps));
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });

    afterAll(async () => {
        await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it('serves health over a real socket', async () => {
        const response = await fetch(`${base}/health`);
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ status: 'ok' });
    });

    it('serves image bytes with the right content type and length', async () => {
        const response = await fetch(`${base}/image/evm/7.png`);
        const bytes = Buffer.from(await response.arrayBuffer());

        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('image/png');
        expect(response.headers.get('content-length')).toBe('4');
        expect(bytes).toHaveLength(4);
    });

    it('strips the query string before routing, so a cache-buster still resolves', async () => {
        const response = await fetch(`${base}/image/evm/7.png?v=2`);
        expect(response.status).toBe(200);
    });

    it('answers HEAD with headers and no body', async () => {
        const response = await fetch(`${base}/image/evm/7.png`, { method: 'HEAD' });

        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('image/png');
        expect((await response.arrayBuffer()).byteLength).toBe(0);
    });

    it('serves metadata as JSON', async () => {
        const response = await fetch(`${base}/metadata/evm/7`);
        expect(response.headers.get('content-type')).toContain('application/json');
        expect(await response.json()).toMatchObject({ name: 'Sparky' });
    });

    it('stays up and answers 500 when a handler throws unexpectedly', async () => {
        const broken = createServer(
            createRequestListener({
                ...deps,
                reader: { read: () => { throw new TypeError('boom'); } },
            }),
        );
        await new Promise<void>((resolve) => broken.listen(0, '127.0.0.1', resolve));
        const brokenBase = `http://127.0.0.1:${(broken.address() as AddressInfo).port}`;
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

        // handleRequest maps this one itself (its catch covers sync throws from
        // the reader too); what matters here is that an unexpected error type
        // still becomes a 500 over the wire and leaves the process serving.
        const response = await fetch(`${brokenBase}/image/evm/7.png`);
        expect(response.status).toBe(500);

        const follow = await fetch(`${brokenBase}/health`);
        expect(follow.status).toBe(200);

        spy.mockRestore();
        await new Promise<void>((resolve) => broken.close(() => resolve()));
    });
});
