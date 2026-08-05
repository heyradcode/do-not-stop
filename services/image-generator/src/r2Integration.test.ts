/**
 * R2 against a fake S3 endpoint, driving the real AWS SDK.
 *
 * r2Store.test.ts injects a stubbed `{ send }`, which proves the class calls the
 * right command names and nothing else: command serialization, request signing,
 * response body parsing, and error mapping all belong to the SDK and never run.
 * That is the same self-consistency trap the ABI test fell into. These tests put a
 * real S3Client in front of a real socket so those layers actually execute.
 *
 * What is still not covered: R2 itself. Only Cloudflare can confirm it accepts
 * what the SDK sends.
 */

import { S3Client } from '@aws-sdk/client-s3';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { afterEach, describe, expect, it } from 'vitest';
import { R2ImageStore, createR2Client, type R2Config } from './r2Store.js';

const CONFIG: R2Config = {
    accountId: 'abc123',
    accessKeyId: 'key',
    secretAccessKey: 'secret',
    bucket: 'pet-art',
};

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);

const s3Error = (code: string) =>
    `<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code>`
    + `<Message>${code}</Message><RequestId>1</RequestId></Error>`;

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
    body: Buffer;
}

/** Stands in for the bucket. Path-style addressing so requests can reach
 *  127.0.0.1; the hostname the production client uses is asserted separately. */
const fakeBucket = async (handler: (req: IncomingMessage, res: ServerResponse, body: Buffer) => void) => {
    const requests: Recorded[] = [];
    const server = createServer((req, res) => {
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
            const body = Buffer.concat(chunks);
            requests.push({
                method: req.method ?? '',
                url: req.url ?? '',
                headers: req.headers as Record<string, string | undefined>,
                body,
            });
            handler(req, res, body);
        });
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

    const port = (server.address() as AddressInfo).port;
    const client = new S3Client({
        region: 'auto',
        endpoint: `http://127.0.0.1:${port}`,
        credentials: { accessKeyId: CONFIG.accessKeyId, secretAccessKey: CONFIG.secretAccessKey },
        forcePathStyle: true,
    });

    return { store: new R2ImageStore(CONFIG, client), requests };
};

describe('R2 addressing', () => {
    // Pins what the production client actually puts on the wire. R2 is reached
    // virtual-hosted style, bucket as a subdomain of the account endpoint. If a
    // deployment ever gets 404s or DNS failures from R2, this is the first thing
    // to revisit: forcePathStyle: true switches to /bucket/key instead.
    it('addresses the bucket as a subdomain of the account endpoint', async () => {
        const client = createR2Client(CONFIG);
        let captured: { hostname: string; path: string } | undefined;

        client.middlewareStack.add(
            () => async (args) => {
                // The SDK types `request` as unknown at this step; at
                // finalizeRequest it is always an HttpRequest.
                const request = args.request as { hostname: string; path: string };
                captured = { hostname: request.hostname, path: request.path };
                throw new Error('captured');
            },
            { step: 'finalizeRequest', name: 'capture' },
        );

        await client
            .send(new GetObjectCommand({ Bucket: CONFIG.bucket, Key: 'art/v1/abc.png' }))
            .catch(() => undefined);

        expect(captured).toEqual({
            hostname: 'pet-art.abc123.r2.cloudflarestorage.com',
            path: '/art/v1/abc.png',
        });
    });
});

describe('R2ImageStore against a real S3 endpoint', () => {
    it('PUTs the bytes to the key, with the immutable cache header', async () => {
        const { store, requests } = await fakeBucket((_req, res) => {
            res.writeHead(200, { etag: '"abc"' });
            res.end();
        });

        await store.put('art/v1/abc.png', { bytes: PNG, contentType: 'image/png' });

        expect(requests).toHaveLength(1);
        expect(requests[0]!.method).toBe('PUT');
        // The SDK appends ?x-id=PutObject; compare the path, as S3 itself does.
        expect(new URL(requests[0]!.url, 'http://x').pathname).toBe('/pet-art/art/v1/abc.png');
        expect(requests[0]!.headers['content-type']).toBe('image/png');
        // Art never changes once written, so every layer in front may cache it.
        expect(requests[0]!.headers['cache-control']).toBe('public, max-age=31536000, immutable');
        expect(requests[0]!.body.equals(PNG)).toBe(true);
    });

    it('signs the request, which a stubbed client never exercises', async () => {
        const { store, requests } = await fakeBucket((_req, res) => {
            res.writeHead(200);
            res.end();
        });

        await store.put('art/v1/abc.png', { bytes: PNG, contentType: 'image/png' });

        expect(requests[0]!.headers.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=key\//);
        expect(requests[0]!.headers['x-amz-content-sha256']).toBeDefined();
    });

    it('GETs and reassembles the streamed body', async () => {
        const { store } = await fakeBucket((req, res) => {
            if (req.method !== 'GET') { res.writeHead(200); res.end(); return; }
            res.writeHead(200, { 'content-type': 'image/png', 'content-length': String(PNG.length) });
            res.end(PNG);
        });

        const object = await store.get('art/v1/abc.png');

        expect(object?.bytes.equals(PNG)).toBe(true);
        expect(object?.contentType).toBe('image/png');
    });

    // The contract the pipeline depends on: a miss is null, never a throw, or
    // every first request for a pet would look like a broken bucket.
    it('maps a real NoSuchKey response to null', async () => {
        const { store } = await fakeBucket((_req, res) => {
            res.writeHead(404, { 'content-type': 'application/xml' });
            res.end(s3Error('NoSuchKey'));
        });

        expect(await store.get('art/v1/missing.png')).toBeNull();
    });

    // Wrong credentials must not read as an empty bucket: that would silently
    // regenerate every pet and bill for it.
    it('propagates AccessDenied instead of reporting a miss', async () => {
        const { store } = await fakeBucket((_req, res) => {
            res.writeHead(403, { 'content-type': 'application/xml' });
            res.end(s3Error('AccessDenied'));
        });

        await expect(store.get('art/v1/abc.png')).rejects.toThrow();
    });

    it('round-trips through the store, not just through a mock', async () => {
        const written = new Map<string, Buffer>();
        const { store } = await fakeBucket((req, res, body) => {
            // Drop the SDK's ?x-id=... before keying, or PUT and GET disagree.
            const key = new URL(req.url ?? '', 'http://x').pathname.replace('/pet-art/', '');
            if (req.method === 'PUT') {
                written.set(key, body);
                res.writeHead(200);
                res.end();
                return;
            }
            const found = written.get(key);
            if (!found) {
                res.writeHead(404, { 'content-type': 'application/xml' });
                res.end(s3Error('NoSuchKey'));
                return;
            }
            res.writeHead(200, { 'content-type': 'image/png' });
            res.end(found);
        });

        expect(await store.get('art/v1/pet.png')).toBeNull();
        await store.put('art/v1/pet.png', { bytes: PNG, contentType: 'image/png' });
        expect((await store.get('art/v1/pet.png'))?.bytes.equals(PNG)).toBe(true);
    });
});
