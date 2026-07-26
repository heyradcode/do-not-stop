import { createServer, type Server } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadReceipts } from '../../src/io/loadReceipts';
import { buildSignedReceipt } from '../fixtures/signedReceipt';

let dir: string;

beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'verifier-loadreceipts-'));
});

afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
});

describe('loadReceipts from a local file', () => {
    it('loads a single receipt in the "single-receipt endpoint" shape ({ hash, ... })', async () => {
        const { envelope } = buildSignedReceipt();
        const file = join(dir, 'receipt.json');
        await writeFile(
            file,
            JSON.stringify({
                hash: envelope.receiptHash,
                signature: envelope.signature,
                signingKeyId: envelope.signingKeyId,
                payload: envelope.payload,
            }),
        );

        const loaded = await loadReceipts(file);
        expect(loaded).toEqual([envelope]);
    });

    it('loads a corpus page shape ({ receipts: [...], nextCursor })', async () => {
        const one = buildSignedReceipt({ battleId: 'btl_0001' });
        const two = buildSignedReceipt({ battleId: 'btl_0002' });
        const file = join(dir, 'corpus.json');
        await writeFile(
            file,
            JSON.stringify({
                receipts: [one.envelope, two.envelope],
                nextCursor: null,
            }),
        );

        const loaded = await loadReceipts(file);
        expect(loaded).toHaveLength(2);
        expect(loaded[0]?.receiptHash).toBe(one.envelope.receiptHash);
        expect(loaded[1]?.receiptHash).toBe(two.envelope.receiptHash);
    });

    it('loads a bare array of receipt entries', async () => {
        const one = buildSignedReceipt({ battleId: 'btl_0001' });
        const file = join(dir, 'array.json');
        await writeFile(file, JSON.stringify([one.envelope]));

        const loaded = await loadReceipts(file);
        expect(loaded).toEqual([one.envelope]);
    });

    it('throws a clear error when the payload field is missing', async () => {
        const file = join(dir, 'no-payload.json');
        await writeFile(file, JSON.stringify({ receiptHash: '0xabc', signature: '0xdef', signingKeyId: 'k' }));
        await expect(loadReceipts(file)).rejects.toThrow(/missing its payload/);
    });

    it('throws when the receipt hash is spelled neither "hash" nor "receiptHash"', async () => {
        const file = join(dir, 'no-hash.json');
        await writeFile(file, JSON.stringify({ signature: '0xdef', signingKeyId: 'k', payload: {} }));
        await expect(loadReceipts(file)).rejects.toThrow(/hash/);
    });
});

describe('loadReceipts from an http(s) URL', () => {
    let server: Server;
    let baseUrl: string;

    beforeEach(async () => {
        server = createServer((_req, res) => {
            const { envelope } = buildSignedReceipt();
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(
                JSON.stringify({
                    hash: envelope.receiptHash,
                    signature: envelope.signature,
                    signingKeyId: envelope.signingKeyId,
                    payload: envelope.payload,
                }),
            );
        });
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        const address = server.address();
        if (address === null || typeof address === 'string') {
            throw new Error('expected a bound TCP address');
        }
        baseUrl = `http://127.0.0.1:${address.port}`;
    });

    afterEach(async () => {
        await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it('fetches and parses a receipt served over http', async () => {
        const loaded = await loadReceipts(baseUrl);
        expect(loaded).toHaveLength(1);
        expect(loaded[0]?.signingKeyId).toBe('battle-signer-2026-07');
    });

    it('throws with the status code when the server responds with an error', async () => {
        server.close();
        server = createServer((_req, res) => {
            res.writeHead(404);
            res.end();
        });
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        const address = server.address();
        if (address === null || typeof address === 'string') {
            throw new Error('expected a bound TCP address');
        }
        await expect(loadReceipts(`http://127.0.0.1:${address.port}`)).rejects.toThrow(/404/);
    });
});
