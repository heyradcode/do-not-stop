/**
 * Immutable image storage.
 *
 * The key is derived from a pet's *art identity* — (dna, rarity, speciesId) —
 * and deliberately NOT from the prompt, the model, or the seed. Keying on the
 * prompt would mean any wording tweak in prompt.ts produces a new key, a cache
 * miss, and a fresh image for a pet that is already minted and already owned.
 * Keying on identity means an existing pet keeps its art no matter how the
 * prompt table later evolves.
 *
 * Regenerating art for existing pets is therefore an explicit, versioned
 * decision: bump ART_VERSION. Old versions stay readable, so a regeneration can
 * be rolled back by pointing the version constant back at the previous value.
 *
 * Two pets with identical dna, rarity, and species look identical by
 * construction, so they share a key and the image is generated once for both.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { PetArtInput } from './traits.js';
import { clampRarity } from './traits.js';

/**
 * Art generation epoch. Bump ONLY to deliberately regenerate every pet's image
 * (a prompt overhaul, a model migration whose output is clearly better). Every
 * pet gets new art on the next request after a bump, and every owner sees their
 * pet change, so this is a product decision and not a refactor.
 */
export const ART_VERSION = 1;

export interface StoredObject {
    bytes: Buffer;
    contentType: string;
}

/** Minimal storage contract. Deliberately narrow so filesystem, R2, and a
 *  later IPFS pin are interchangeable. Implementations must treat a written key
 *  as immutable. */
export interface ImageStore {
    /** Null on miss. Must not throw for a missing key. */
    get(key: string): Promise<StoredObject | null>;
    /** Write once. Overwriting an existing key is a caller bug. */
    put(key: string, object: StoredObject): Promise<void>;
    /** Publicly reachable URL, when the backing store has one. */
    publicUrl?(key: string): string | undefined;
}

/** Stable digest of the inputs that fully determine a pet's appearance. */
export const petArtDigest = ({ dna, rarity, speciesId }: PetArtInput): string =>
    createHash('sha256')
        .update(`v${ART_VERSION}|${dna.toString()}|${clampRarity(rarity)}|${speciesId ?? 'dna'}`)
        .digest('hex')
        .slice(0, 32);

export const petImageKey = (input: PetArtInput): string => `art/v${ART_VERSION}/${petArtDigest(input)}.png`;

/** Sidecar recording what produced an image: provenance for a pet whose art
 *  cannot be re-derived from the prompt alone once a model version moves on. */
export const petManifestKey = (input: PetArtInput): string =>
    `art/v${ART_VERSION}/${petArtDigest(input)}.json`;

export interface ArtManifest {
    artVersion: number;
    dna: string;
    rarity: number;
    speciesId: number | null;
    traits: Record<string, number>;
    model: string;
    prompt: string;
    negativePrompt: string;
    seed: number;
    bytes: number;
    generatedAt: string;
}

export const encodeManifest = (manifest: ArtManifest): StoredObject => ({
    bytes: Buffer.from(JSON.stringify(manifest, null, 2)),
    contentType: 'application/json',
});

/** In-memory store. Used by tests, and the sane default for `pnpm generate`
 *  where nothing should persist. */
export class MemoryImageStore implements ImageStore {
    private readonly objects = new Map<string, StoredObject>();

    async get(key: string): Promise<StoredObject | null> {
        return this.objects.get(key) ?? null;
    }

    async put(key: string, object: StoredObject): Promise<void> {
        this.objects.set(key, object);
    }

    get size(): number {
        return this.objects.size;
    }
}

const CONTENT_TYPES: Record<string, string> = {
    '.png': 'image/png',
    '.json': 'application/json',
};

/** Filesystem store for local development. Not for production: instances do not
 *  share a disk, so each one would generate its own copy of every pet. */
export class FilesystemImageStore implements ImageStore {
    constructor(private readonly root: string) {}

    private path(key: string): string {
        const full = resolve(join(this.root, key));
        // Keys are internally generated, but a path-traversal guard is cheap and
        // this is the one place a key reaches the filesystem.
        if (!full.startsWith(resolve(this.root))) {
            throw new Error(`Refusing to resolve key outside the store root: ${key}`);
        }
        return full;
    }

    async get(key: string): Promise<StoredObject | null> {
        try {
            const bytes = await readFile(this.path(key));
            return { bytes, contentType: contentTypeFor(key) };
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
            throw error;
        }
    }

    async put(key: string, object: StoredObject): Promise<void> {
        const path = this.path(key);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, object.bytes);
    }
}

export const contentTypeFor = (key: string): string => {
    const dot = key.lastIndexOf('.');
    return (dot === -1 ? undefined : CONTENT_TYPES[key.slice(dot)]) ?? 'application/octet-stream';
};
