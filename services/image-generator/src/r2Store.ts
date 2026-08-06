/**
 * Cloudflare R2 store, via R2's S3-compatible API.
 *
 * R2 is the default production backend: same account as Workers AI, no egress
 * fees, and a bucket can be exposed publicly so the NFT image URL is served by
 * Cloudflare rather than by this service. An IPFS or Arweave pin can be added
 * later as a second ImageStore without touching the pipeline, since the
 * interface is get/put only.
 *
 * NOTE: written against R2's documented S3 compatibility and exercised against
 * a mocked S3 client only. Verify with a real bucket before relying on it.
 */

import { GetObjectCommand, NoSuchKey, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { ImageStore, StoredObject } from './store.js';
import { contentTypeFor } from './store.js';

export interface R2Config {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
    /** Public bucket or custom-domain base URL, when one is configured. */
    publicBaseUrl?: string;
    /**
     * Overrides the account endpoint. Without this the R2 path in the shipped
     * binary cannot be exercised anywhere but production, since the hostname is
     * derived from the account id. Also lets any S3-compatible store stand in.
     */
    endpoint?: string;
}

/** R2 ignores the region but the S3 client requires one. */
const R2_REGION = 'auto';

export const createR2Client = (config: R2Config): S3Client =>
    new S3Client({
        region: R2_REGION,
        endpoint: config.endpoint ?? `https://${config.accountId}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
        },
        // R2 is addressed virtual-hosted style, bucket as a subdomain of the
        // account endpoint. A custom endpoint is a host that has no such
        // subdomains, so it gets /bucket/key instead.
        forcePathStyle: config.endpoint !== undefined,
    });

export class R2ImageStore implements ImageStore {
    constructor(
        private readonly config: R2Config,
        private readonly client: S3Client = createR2Client(config),
    ) {}

    async get(key: string): Promise<StoredObject | null> {
        try {
            const response = await this.client.send(
                new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
            );
            const bytes = Buffer.from(await response.Body!.transformToByteArray());
            return { bytes, contentType: response.ContentType ?? contentTypeFor(key) };
        } catch (error) {
            if (isNotFound(error)) return null;
            throw error;
        }
    }

    async put(key: string, object: StoredObject): Promise<void> {
        await this.client.send(
            new PutObjectCommand({
                Bucket: this.config.bucket,
                Key: key,
                Body: object.bytes,
                ContentType: object.contentType,
                // Art is immutable once written (see store.ts), so it is safe to
                // cache forever at every layer in front of the bucket.
                CacheControl: 'public, max-age=31536000, immutable',
            }),
        );
    }

    publicUrl(key: string): string | undefined {
        const base = this.config.publicBaseUrl;
        return base ? `${base.replace(/\/+$/, '')}/${key}` : undefined;
    }
}

/** A missing key surfaces as NoSuchKey, or as a bare 404 when R2 answers a HEAD
 *  style response without the modelled error shape.
 *
 *  A missing *bucket* is also a 404, and must not be read as a miss. Doing so
 *  turns a misconfigured R2_BUCKET into "not cached yet, generate it", which
 *  then fails on the write with the real error — and makes /ready report the
 *  store healthy, since its probe is a get() it expects to miss. That is
 *  precisely the failure readiness.ts claims to catch. */
const isNotFound = (error: unknown): boolean => {
    if (error instanceof NoSuchKey) return true;
    const meta = (error as { $metadata?: { httpStatusCode?: number }; name?: string });
    if (meta.name === 'NoSuchBucket') return false;
    return meta.$metadata?.httpStatusCode === 404 || meta.name === 'NotFound';
};
