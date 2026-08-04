/**
 * End-to-end tests over real sockets.
 *
 * Everything else in this suite mocks at a module boundary, which cannot catch a
 * mistake in the wiring *between* modules: JSON-RPC framing, base64 handling, ABI
 * encoding, or the order of reads a request performs. These stand up fake chain
 * RPCs and drive the real listener over HTTP, so the only thing still simulated is
 * the far side of the network.
 *
 * They stop short of Cloudflare and R2, which have no local stand-in.
 */

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { encodeFunctionResult } from 'viem';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EvmPetReader, PET_CORE_ABI } from './chain.js';
import type { WorkersAiConfig } from './config.js';
import type { PetMetadata } from './metadata.js';
import type { PipelineDeps } from './pipeline.js';
import { createReaderRouter } from './readerRouter.js';
import type { RouteDeps } from './routes.js';
import { createRequestListener } from './server.js';
import {
    PET_ACCOUNT_OFFSETS as OFFSET,
    PET_ACCOUNT_SPACE,
    SolanaPetReader,
    petAccountDiscriminator,
} from './solana.js';
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

const DNA = 7_934_056_188_134_207n;
const ASSET = 'So11111111111111111111111111111111111111112';

const servers: Server[] = [];

const listen = async (server: Server): Promise<string> => {
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};

afterEach(async () => {
    // closeAllConnections first: close() alone waits for open sockets, and a test
    // that deliberately hangs a request would hold teardown until the socket dies.
    await Promise.all(servers.splice(0).map((s) => new Promise<void>((resolve) => {
        s.closeAllConnections();
        s.close(() => resolve());
    })));
});

/** Collects request bodies so a test can assert what actually went on the wire. */
const jsonRpc = (respond: (method: string, params: unknown[]) => unknown) => {
    const calls: { method: string; params: unknown[] }[] = [];
    const server = createServer((req, res) => {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
            const parsed = JSON.parse(body) as { method: string; params: unknown[] };
            calls.push(parsed);
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result: respond(parsed.method, parsed.params) }));
        });
    });
    return { server, calls };
};

const appFor = async (reader: RouteDeps['reader'], generate: NonNullable<PipelineDeps['generate']>) => {
    const store = new MemoryImageStore();
    const deps: RouteDeps = {
        config: CONFIG,
        store,
        generate,
        reader,
        publicBaseUrl: 'http://placeholder',
    };
    const base = await listen(createServer(createRequestListener(deps)));
    return { base, store, deps };
};

describe('solana, over a real socket', () => {
    /** A PetAccount laid out the way the chain stores it. */
    const petAccount = (speciesId: number): Buffer => {
        const data = Buffer.alloc(PET_ACCOUNT_SPACE);
        petAccountDiscriminator().copy(data, 0);
        data.writeBigUInt64LE(DNA, OFFSET.dna!);
        data.writeUInt8(4, OFFSET.rarity!);
        data.writeUInt16LE(9, OFFSET.level!);
        data.writeUInt16LE(speciesId, OFFSET.speciesId!);
        Buffer.from('Solpet').copy(data, OFFSET.name!);
        data.writeUInt8(6, OFFSET.nameLen!);
        return data;
    };

    const solanaApp = async (speciesId = 0) => {
        const rpc = jsonRpc(() => [{ account: { data: [petAccount(speciesId).toString('base64'), 'base64'] } }]);
        const rpcUrl = await listen(rpc.server);
        const reader = createReaderRouter({
            solana: new SolanaPetReader({ rpcUrl, programId: 'CrYPtoPeTs1111111111111111111111111111111111' }),
        });
        const app = await appFor(reader, (async () => Buffer.from('PNG')) as NonNullable<PipelineDeps['generate']>);
        return { ...app, calls: rpc.calls };
    };

    it('filters getProgramAccounts by account size and asset offset', async () => {
        const { base, calls } = await solanaApp();
        await fetch(`${base}/metadata/solana/${ASSET}`);

        expect(calls[0]!.method).toBe('getProgramAccounts');
        expect((calls[0]!.params[1] as { filters: unknown }).filters).toEqual([
            { dataSize: 223 },
            { memcmp: { offset: 183, bytes: ASSET } },
        ]);
    });

    it('decodes a real base64 account into metadata', async () => {
        const { base } = await solanaApp();
        const metadata = (await (await fetch(`${base}/metadata/solana/${ASSET}`)).json()) as PetMetadata;

        expect(metadata.name).toBe('Solpet');
        expect(metadata.attributes).toContainEqual({ trait_type: 'Rarity', value: 'Epic' });
    });

    // species_id is 0 until species pools land on Solana. End to end, that must
    // fall back to DNA pair 6 (34 % 8 = 2, Sleek) rather than species zero
    // (Bulwark), or every Solana pet would share one silhouette.
    it('falls back to DNA for the body when species is unset', async () => {
        const unset = await solanaApp(0);
        const set = await solanaApp(6);

        const a = (await (await fetch(`${unset.base}/metadata/solana/${ASSET}`)).json()) as PetMetadata;
        const b = (await (await fetch(`${set.base}/metadata/solana/${ASSET}`)).json()) as PetMetadata;

        expect(a.attributes).toContainEqual({ trait_type: 'Body', value: 'Sleek' });
        expect(b.attributes).toContainEqual({ trait_type: 'Body', value: 'Phoenix' });
    });

    it('serves the image the metadata points at', async () => {
        const { base } = await solanaApp();
        const metadata = (await (await fetch(`${base}/metadata/solana/${ASSET}`)).json()) as PetMetadata;
        const path = new URL(metadata.image).pathname;

        const image = await fetch(`${base}${path}`);
        expect(image.status).toBe(200);
        expect(image.headers.get('content-type')).toBe('image/png');
    });
});

describe('evm, over a real socket', () => {
    /**
     * A real getPet return, encoded with the ABI solc emitted from PetCore.sol
     * rather than with this service's hand-written copy.
     *
     * That independence is the entire point. Encoding with PET_CORE_ABI and
     * decoding with PET_CORE_ABI round-trips no matter how wrong that ABI is, so
     * such a test passes even with a component deleted, which is exactly the
     * misalignment it claims to catch. Regenerate from
     * contracts/ethereum/artifacts/src/PetCore.sol/PetCore.json if the Pet struct
     * legitimately changes; a failure here otherwise means this service's ABI has
     * drifted from the contract.
     *
     * Encodes: name Sparky, dna 7934056188134207, level 4, winCount 3,
     * lossCount 1, rarity 3, generation 1, speciesId 6.
     */
    const GET_PET_RESULT = '0x'
    + '0000000000000000000000000000000000000000000000000000000000000020000000000000'
    + '0000000000000000000000000000000000000000000000000220000000000000000000000000'
    + '000000000000000000000000001c2ffb68b8c33f000000000000000000000000000000000000'
    + '0000000000000000000000000004000000000000000000000000000000000000000000000000'
    + '0000000000000000000000000000000000000000000000000000000000000000000000000000'
    + '0003000000000000000000000000000000000000000000000000000000000000000100000000'
    + '0000000000000000000000000000000000000000000000000000000300000000000000000000'
    + '0000000000000000000000000000000000000000000000000000000000000000000000000000'
    + '0000000000000000000000000000000100000000000000000000000000000000000000000000'
    + '0000000000000000000000000000000000000000000000000000000000000000000000000000'
    + '0000000000000000000000000000000000000000000000000000000000000000000000000000'
    + '0000000000000000000000000000000000000000000000000000000000060000000000000000'
    + '0000000000000000000000000000000000000000000000000000000000000000000000000000'
    + '0000000000000000000000000000000000000000000000000000000000000000000000000000'
    + '0000000000000000000000000000000000000000000000000000000000000000000000000000'
    + '0000000000000000000000000000000000000000000000000000000000000000000000000006'
    + '537061726b790000000000000000000000000000000000000000000000000000';

    const evmApp = async (totalPets = 10n) => {
        const rpc = jsonRpc((method, params) => {
            if (method !== 'eth_call') return '0x1';
            const data = (params[0] as { data: string }).data;
            // getPet's selector differs from totalPets'; dispatch on which arrived.
            const isTotal = data.length <= 10;
            return isTotal
                ? encodeFunctionResult({ abi: PET_CORE_ABI, functionName: 'totalPets', result: totalPets })
                : GET_PET_RESULT;
        });
        const rpcUrl = await listen(rpc.server);
        const reader = createReaderRouter({
            evm: new EvmPetReader({
                rpcUrl,
                petCoreAddress: '0x0BB0e03259Cf9DA7B0A3e258e2D17d68D7be9d33',
            }),
        });
        const generate = vi.fn(async () => Buffer.from('PNG'));
        const app = await appFor(reader, generate as unknown as NonNullable<PipelineDeps['generate']>);
        return { ...app, calls: rpc.calls, generate };
    };

    // The ABI must spell out the whole Pet struct: viem decodes the tuple
    // positionally, so a missing component would silently land dna on another
    // field and cache art for the wrong pet forever. Encoding with the same ABI
    // and decoding through viem is what proves the layout round-trips.
    it('decodes the full Pet tuple, putting dna where the art derivation expects it', async () => {
        const { base } = await evmApp();
        const metadata = (await (await fetch(`${base}/metadata/evm/7`)).json()) as PetMetadata;

        expect(metadata.name).toBe('Sparky');
        // Derived from dna and speciesId; wrong only if the tuple misaligned.
        expect(metadata.attributes).toContainEqual({ trait_type: 'Element', value: 'Water' });
        expect(metadata.attributes).toContainEqual({ trait_type: 'Body', value: 'Phoenix' });
        expect(metadata.attributes).toContainEqual({ trait_type: 'Level', value: 4, display_type: 'number' });
    });

    it('reads getPet and totalPets together, so existence costs no extra latency', async () => {
        const { base, calls } = await evmApp();
        await fetch(`${base}/metadata/evm/7`);

        expect(calls.filter((c) => c.method === 'eth_call')).toHaveLength(2);
    });

    it('answers 404 past the last minted id without generating', async () => {
        const { base, generate } = await evmApp(5n);

        expect((await fetch(`${base}/image/evm/9.png`)).status).toBe(404);
        expect(generate).not.toHaveBeenCalled();
    });

    it('serves an image end to end', async () => {
        const { base } = await evmApp();
        const image = await fetch(`${base}/image/evm/7.png`);

        expect(image.status).toBe(200);
        expect(image.headers.get('x-art-cache')).toBe('miss');
        expect((await fetch(`${base}/image/evm/7.png`)).headers.get('x-art-cache')).toBe('hit');
    });
});
