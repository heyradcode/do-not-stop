import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    ART_VERSION,
    FilesystemImageStore,
    MemoryImageStore,
    contentTypeFor,
    petArtDigest,
    petImageKey,
    petManifestKey,
} from './store.js';

const DNA = 79_34_05_61_88_13_42_07n;
const PET = { dna: DNA, rarity: 3 };

describe('petArtDigest', () => {
    it('keys on art identity, not on the prompt', () => {
        expect(petArtDigest(PET)).toBe(petArtDigest({ dna: DNA, rarity: 3 }));
    });

    it('separates pets that look different', () => {
        expect(petArtDigest({ dna: DNA, rarity: 4 })).not.toBe(petArtDigest(PET));
        expect(petArtDigest({ dna: DNA + 1n, rarity: 3 })).not.toBe(petArtDigest(PET));
        expect(petArtDigest({ ...PET, speciesId: 2 })).not.toBe(petArtDigest(PET));
    });

    it('treats rarity 0 and rarity 1 as one pet, matching the clamp', () => {
        expect(petArtDigest({ dna: DNA, rarity: 0 })).toBe(petArtDigest({ dna: DNA, rarity: 1 }));
    });

    it('does not collide an explicit speciesId with the DNA fallback', () => {
        // DNA pair 6 is 34, which the body derivation reduces to 34 % 8 = 2. An
        // explicit speciesId of 2 looks identical but must stay a distinct key,
        // because the pet it describes is a different record.
        expect(petArtDigest({ ...PET, speciesId: 2 })).not.toBe(petArtDigest(PET));
    });
});

describe('key layout', () => {
    it('namespaces by art version so a bump cannot overwrite old art', () => {
        expect(petImageKey(PET)).toBe(`art/v${ART_VERSION}/${petArtDigest(PET)}.png`);
        expect(petManifestKey(PET)).toBe(`art/v${ART_VERSION}/${petArtDigest(PET)}.json`);
    });
});

describe('contentTypeFor', () => {
    it('maps the extensions the store writes', () => {
        expect(contentTypeFor('art/v1/abc.png')).toBe('image/png');
        expect(contentTypeFor('art/v1/abc.json')).toBe('application/json');
        expect(contentTypeFor('noextension')).toBe('application/octet-stream');
    });
});

describe('MemoryImageStore', () => {
    it('round-trips and misses cleanly', async () => {
        const store = new MemoryImageStore();
        expect(await store.get('missing')).toBeNull();

        await store.put('k.png', { bytes: Buffer.from('x'), contentType: 'image/png' });
        expect((await store.get('k.png'))?.bytes.toString()).toBe('x');
    });
});

describe('FilesystemImageStore', () => {
    let root: string;
    let store: FilesystemImageStore;

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'art-store-'));
        store = new FilesystemImageStore(root);
    });

    afterEach(async () => {
        await rm(root, { recursive: true, force: true });
    });

    it('returns null for a missing key rather than throwing', async () => {
        expect(await store.get(petImageKey(PET))).toBeNull();
    });

    it('creates nested directories and round-trips bytes with a content type', async () => {
        const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
        await store.put(petImageKey(PET), { bytes, contentType: 'image/png' });

        const read = await store.get(petImageKey(PET));
        expect(read?.bytes.equals(bytes)).toBe(true);
        expect(read?.contentType).toBe('image/png');
    });

    it('refuses keys that escape the store root', async () => {
        const object = { bytes: Buffer.from('x'), contentType: 'image/png' };

        for (const key of [
            '../escaped.png',
            '../../escaped.png',
            // A sibling directory whose name merely starts with the root's name.
            // A startsWith(root) check passes these, which is the whole point:
            // for a root of ".../art", "../artifacts/x" resolves outside it but
            // still shares the prefix.
            `../${'art'}ifacts/escaped.png`,
            '../art-backup/escaped.png',
        ]) {
            await expect(store.put(key, object)).rejects.toThrow(/outside the store root/);
            await expect(store.get(key)).rejects.toThrow(/outside the store root/);
        }
    });

    it('still allows ordinary nested keys', async () => {
        const object = { bytes: Buffer.from('x'), contentType: 'image/png' };
        await expect(store.put('art/v1/deep/nested.png', object)).resolves.toBeUndefined();
    });
});
