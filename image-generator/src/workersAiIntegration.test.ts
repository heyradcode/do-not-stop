/**
 * Workers AI against a fake Cloudflare endpoint, over a real socket.
 *
 * workersAi.test.ts hands `fetch` a hand-built `Response`, which exercises the
 * parsing branches but never the wire: header serialization, a streamed binary
 * body, or the abort signal firing against a server that does not answer. This
 * drives real `fetch` at a real HTTP server instead.
 *
 * The one thing it cannot tell you is whether Cloudflare accepts this request.
 * What it can do is show exactly what would be sent, so the shape can be compared
 * against Cloudflare's documentation without a token.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { WorkersAiConfig } from './config.js';
import { buildPetPrompt } from './prompt.js';
import type { RetryOptions } from './retry.js';
import { derivePetVisualTraits } from './traits.js';
import { WorkersAiError, generateImage } from './workersAi.js';

const DNA = 79_34_05_61_88_13_42_07n;
const SPEC = buildPetPrompt(derivePetVisualTraits({ dna: DNA, rarity: 3 }), DNA);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const NO_RETRY: RetryOptions = { attempts: 1, baseDelayMs: 0, maxDelayMs: 0 };
const instantRetry = (attempts: number): RetryOptions => ({
    attempts,
    baseDelayMs: 1,
    maxDelayMs: 1,
    sleep: async () => {},
    onRetry: () => {},
});

const servers: Server[] = [];

afterEach(async () => {
    // closeAllConnections first: close() alone waits for open sockets, and a test
    // that deliberately hangs a request would hold teardown until the socket dies.
    await Promise.all(servers.splice(0).map((s) => new Promise<void>((resolve) => {
        s.closeAllConnections();
        s.close(() => resolve());
    })));
});

interface Recorded {
    method: string;
    url: string;
    headers: Record<string, string | undefined>;
    body: string;
}

const fakeCloudflare = async (handler: (req: IncomingMessage, res: ServerResponse, n: number) => void) => {
    const requests: Recorded[] = [];
    const server = createServer((req, res) => {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
            requests.push({
                method: req.method ?? '',
                url: req.url ?? '',
                headers: req.headers as Record<string, string | undefined>,
                body,
            });
            handler(req, res, requests.length);
        });
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

    const port = (server.address() as AddressInfo).port;
    const config: WorkersAiConfig = {
        // The client builds `${API_BASE}/${accountId}/ai/run/${model}`, so pointing
        // accountId at the fake host is what redirects it without changing code.
        accountId: 'acct123',
        apiToken: 'token123',
        model: '@cf/bytedance/stable-diffusion-xl-lightning',
    apiBase: 'https://api.cloudflare.com/client/v4/accounts',
        size: 1024,
        steps: 8,
        timeoutMs: 400,
        attempts: 1,
        maxConcurrent: 2,
    };
    // apiBase points at the fake server, so real fetch is used unmodified.
    return { config: { ...config, apiBase: `http://127.0.0.1:${port}/client/v4/accounts` }, fetchImpl: fetch, requests };
};

describe('the request Workers AI actually receives', () => {
    it('posts JSON to the account/model run path with a bearer token', async () => {
        const { config, fetchImpl, requests } = await fakeCloudflare((_req, res) => {
            res.writeHead(200, { 'content-type': 'image/png' });
            res.end(PNG);
        });

        await generateImage(config, SPEC, fetchImpl, NO_RETRY);

        const sent = requests[0]!;
        expect(sent.method).toBe('POST');
        expect(sent.url).toBe('/client/v4/accounts/acct123/ai/run/@cf/bytedance/stable-diffusion-xl-lightning');
        expect(sent.headers.authorization).toBe('Bearer token123');
        expect(sent.headers['content-type']).toBe('application/json');

        // The body as Cloudflare would parse it, not as the client remembers it.
        expect(JSON.parse(sent.body)).toEqual({
            prompt: SPEC.prompt,
            negative_prompt: SPEC.negativePrompt,
            height: 1024,
            width: 1024,
            num_steps: 8,
            seed: SPEC.seed,
        });
    });
});

describe('responses off the wire', () => {
    it('reassembles a streamed PNG body', async () => {
        const { config, fetchImpl } = await fakeCloudflare((_req, res) => {
            res.writeHead(200, { 'content-type': 'image/png' });
            // Deliberately chunked: a single hand-built Response never tests this.
            res.write(PNG.subarray(0, 4));
            res.end(PNG.subarray(4));
        });

        const bytes = await generateImage(config, SPEC, fetchImpl, NO_RETRY);
        expect(bytes.equals(PNG)).toBe(true);
    });

    it('decodes the base64 envelope models like flux return', async () => {
        const { config, fetchImpl } = await fakeCloudflare((_req, res) => {
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ success: true, result: { image: PNG.toString('base64') } }));
        });

        const bytes = await generateImage(config, SPEC, fetchImpl, NO_RETRY);
        expect(bytes.equals(PNG)).toBe(true);
    });

    it('surfaces a Cloudflare-level failure that arrives as HTTP 200', async () => {
        const { config, fetchImpl } = await fakeCloudflare((_req, res) => {
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ success: false, errors: [{ code: 3036, message: 'Account limited' }] }));
        });

        await expect(generateImage(config, SPEC, fetchImpl, NO_RETRY)).rejects.toThrow(/Account limited/);
    });
});

describe('failure handling on a real connection', () => {
    it('retries a 429 and honours the Retry-After it sent', async () => {
        const delays: number[] = [];
        const { config, fetchImpl, requests } = await fakeCloudflare((_req, res, n) => {
            if (n === 1) {
                res.writeHead(429, { 'retry-after': '2' });
                res.end('rate limited');
                return;
            }
            res.writeHead(200, { 'content-type': 'image/png' });
            res.end(PNG);
        });

        const bytes = await generateImage(config, SPEC, fetchImpl, {
            attempts: 2,
            baseDelayMs: 5,
            maxDelayMs: 60_000,
            sleep: async (ms) => { delays.push(ms); },
            onRetry: () => {},
        });

        expect(bytes.equals(PNG)).toBe(true);
        expect(requests).toHaveLength(2);
        expect(delays).toEqual([2_000]);
    });

    it('does not retry a 400, which would only repeat the same rejection', async () => {
        const { config, fetchImpl, requests } = await fakeCloudflare((_req, res) => {
            res.writeHead(400, { 'content-type': 'text/plain' });
            res.end('bad prompt');
        });

        await expect(generateImage(config, SPEC, fetchImpl, instantRetry(3))).rejects.toThrow(/400/);
        expect(requests).toHaveLength(1);
    });

    // timeoutMs is enforced by AbortSignal.timeout, which no hand-built Response
    // can exercise: it needs a server that accepts the connection and then says
    // nothing, which is exactly how a stalled upstream behaves.
    it('aborts a request the server never answers, and treats it as retryable', async () => {
        const { config, fetchImpl, requests } = await fakeCloudflare((_req, res, n) => {
            if (n === 1) return; // hang, never respond
            res.writeHead(200, { 'content-type': 'image/png' });
            res.end(PNG);
        });

        const started = Date.now();
        const bytes = await generateImage(config, SPEC, fetchImpl, instantRetry(2));

        expect(bytes.equals(PNG)).toBe(true);
        expect(requests).toHaveLength(2);
        // Bounded by timeoutMs (400ms), not left hanging.
        expect(Date.now() - started).toBeLessThan(3_000);
    });

    it('gives up after a stall when no attempts remain, as a retryable error', async () => {
        const { config, fetchImpl } = await fakeCloudflare(() => undefined);

        const error = await generateImage(config, SPEC, fetchImpl, NO_RETRY).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(WorkersAiError);
        expect((error as WorkersAiError).retryable).toBe(true);
    });
});
