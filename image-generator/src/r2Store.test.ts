import { GetObjectCommand, NoSuchKey, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { describe, expect, it, vi } from 'vitest';
import { R2ImageStore, createR2Client, type R2Config } from './r2Store.js';

const CONFIG: R2Config = {
    accountId: 'acct123',
    accessKeyId: 'key',
    secretAccessKey: 'secret',
    bucket: 'pet-art',
};

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

const clientReturning = (result: unknown): S3Client =>
    ({ send: vi.fn(async () => result) }) as unknown as S3Client;

const clientRejecting = (error: unknown): S3Client =>
    ({ send: vi.fn(async () => { throw error; }) }) as unknown as S3Client;

const notFound = (status: number) => Object.assign(new Error('missing'), { $metadata: { httpStatusCode: status } });

describe('createR2Client', () => {
    it('points at the account R2 endpoint with the auto region', async () => {
        const client = createR2Client(CONFIG);
        expect(await client.config.region()).toBe('auto');
        // The SDK resolves the endpoint into its parsed parts, not a string.
        expect(await client.config.endpoint!()).toMatchObject({
            hostname: 'acct123.r2.cloudflarestorage.com',
            protocol: 'https:',
        });
    });
});

describe('R2ImageStore.get', () => {
    it('reads bytes and trusts the stored content type', async () => {
        const client = clientReturning({
            ContentType: 'image/png',
            Body: { transformToByteArray: async () => new Uint8Array(PNG) },
        });

        const object = await new R2ImageStore(CONFIG, client).get('art/v1/abc.png');

        expect(object?.bytes.equals(PNG)).toBe(true);
        expect(object?.contentType).toBe('image/png');
        const command = vi.mocked(client.send).mock.calls[0]![0] as unknown as GetObjectCommand;
        expect(command).toBeInstanceOf(GetObjectCommand);
        expect(command.input).toMatchObject({ Bucket: 'pet-art', Key: 'art/v1/abc.png' });
    });

    it('falls back to the key extension when R2 returns no content type', async () => {
        const client = clientReturning({ Body: { transformToByteArray: async () => new Uint8Array(PNG) } });
        expect((await new R2ImageStore(CONFIG, client).get('art/v1/abc.png'))?.contentType).toBe('image/png');
    });

    it('returns null for a miss instead of throwing', async () => {
        const noSuchKey = new NoSuchKey({ message: 'nope', $metadata: {} });
        expect(await new R2ImageStore(CONFIG, clientRejecting(noSuchKey)).get('k.png')).toBeNull();
        expect(await new R2ImageStore(CONFIG, clientRejecting(notFound(404))).get('k.png')).toBeNull();
    });

    it('propagates real failures so a broken bucket is never mistaken for a miss', async () => {
        const store = new R2ImageStore(CONFIG, clientRejecting(notFound(403)));
        await expect(store.get('k.png')).rejects.toThrow();
    });
});

describe('R2ImageStore.put', () => {
    it('writes with an immutable cache header', async () => {
        const client = clientReturning({});
        await new R2ImageStore(CONFIG, client).put('art/v1/abc.png', {
            bytes: PNG,
            contentType: 'image/png',
        });

        const command = vi.mocked(client.send).mock.calls[0]![0] as unknown as PutObjectCommand;
        expect(command).toBeInstanceOf(PutObjectCommand);
        expect(command.input).toMatchObject({
            Bucket: 'pet-art',
            Key: 'art/v1/abc.png',
            ContentType: 'image/png',
            CacheControl: 'public, max-age=31536000, immutable',
        });
    });
});

describe('R2ImageStore.publicUrl', () => {
    it('joins the configured base URL, tolerating a trailing slash', () => {
        const withSlash = new R2ImageStore({ ...CONFIG, publicBaseUrl: 'https://cdn.example/' });
        expect(withSlash.publicUrl('art/v1/abc.png')).toBe('https://cdn.example/art/v1/abc.png');
    });

    it('is undefined when the bucket is not public', () => {
        expect(new R2ImageStore(CONFIG).publicUrl('art/v1/abc.png')).toBeUndefined();
    });
});
