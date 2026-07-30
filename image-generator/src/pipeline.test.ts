import { describe, expect, it, vi } from 'vitest';
import type { WorkersAiConfig } from './config.js';
import { getOrCreatePetImage, type PipelineDeps } from './pipeline.js';
import type { ArtManifest, ImageStore } from './store.js';
import { MemoryImageStore, petImageKey, petManifestKey } from './store.js';

const DNA = 79_34_05_61_88_13_42_07n;
const PET = { dna: DNA, rarity: 3 };

const CONFIG: WorkersAiConfig = {
    accountId: 'acct',
    apiToken: 'token',
    model: '@cf/bytedance/stable-diffusion-xl-lightning',
    size: 1024,
    steps: 8,
    timeoutMs: 5_000,
    attempts: 1,
    maxConcurrent: 2,
};

/** Diffusion is not reproducible, so the fake returns different bytes each call:
 *  any test that passes only because two generations happened to match would be
 *  lying about the cache. */
const fakeGenerator = () => {
    let calls = 0;
    const generate = vi.fn(async () => Buffer.from(`image-${++calls}`));
    return { generate: generate as unknown as NonNullable<PipelineDeps['generate']>, calls: () => generate.mock.calls.length };
};

const deps = (store: ImageStore, generate: NonNullable<PipelineDeps['generate']>): PipelineDeps => ({
    config: CONFIG,
    store,
    generate,
    now: () => new Date('2026-07-29T00:00:00.000Z'),
});

describe('getOrCreatePetImage', () => {
    it('generates on a miss and writes both the image and its manifest', async () => {
        const store = new MemoryImageStore();
        const fake = fakeGenerator();

        const result = await getOrCreatePetImage(deps(store, fake.generate), PET);

        expect(result.cached).toBe(false);
        expect(result.key).toBe(petImageKey(PET));
        expect(result.contentType).toBe('image/png');
        expect(result.summary).toContain('Rare Water');
        expect((await store.get(petImageKey(PET)))?.bytes.toString()).toBe('image-1');
        expect(await store.get(petManifestKey(PET))).not.toBeNull();
    });

    it('serves the cached image and never bills a second inference', async () => {
        const store = new MemoryImageStore();
        const fake = fakeGenerator();
        const d = deps(store, fake.generate);

        const first = await getOrCreatePetImage(d, PET);
        const second = await getOrCreatePetImage(d, PET);

        expect(fake.calls()).toBe(1);
        expect(second.cached).toBe(true);
        expect(second.bytes.equals(first.bytes)).toBe(true);
    });

    it('records provenance a prompt change would otherwise lose', async () => {
        const store = new MemoryImageStore();
        const fake = fakeGenerator();
        await getOrCreatePetImage(deps(store, fake.generate), { ...PET, speciesId: 6 });

        const raw = await store.get(petManifestKey({ ...PET, speciesId: 6 }));
        const manifest = JSON.parse(raw!.bytes.toString()) as ArtManifest;

        expect(manifest.dna).toBe(DNA.toString());
        expect(manifest.rarity).toBe(3);
        expect(manifest.speciesId).toBe(6);
        expect(manifest.model).toBe(CONFIG.model);
        expect(manifest.prompt).toContain('phoenix-like'); // speciesId 6
        expect(manifest.seed).toBeGreaterThan(0);
        expect(manifest.bytes).toBe('image-1'.length);
        expect(manifest.generatedAt).toBe('2026-07-29T00:00:00.000Z');
    });

    it('collapses concurrent first requests for one pet into a single generation', async () => {
        const store = new MemoryImageStore();
        const fake = fakeGenerator();
        const d = deps(store, fake.generate);

        const results = await Promise.all([
            getOrCreatePetImage(d, PET),
            getOrCreatePetImage(d, PET),
            getOrCreatePetImage(d, PET),
        ]);

        expect(fake.calls()).toBe(1);
        for (const result of results) expect(result.bytes.toString()).toBe('image-1');
    });

    it('still generates separately for different pets', async () => {
        const store = new MemoryImageStore();
        const fake = fakeGenerator();
        const d = deps(store, fake.generate);

        await Promise.all([
            getOrCreatePetImage(d, PET),
            getOrCreatePetImage(d, { dna: DNA, rarity: 5 }),
        ]);

        expect(fake.calls()).toBe(2);
    });

    it('does not leave a poisoned in-flight entry after a failure', async () => {
        const store = new MemoryImageStore();
        const generate = vi
            .fn()
            .mockRejectedValueOnce(new Error('workers ai down'))
            .mockResolvedValueOnce(Buffer.from('recovered'));
        const d = deps(store, generate as unknown as NonNullable<PipelineDeps['generate']>);

        await expect(getOrCreatePetImage(d, PET)).rejects.toThrow('workers ai down');

        const retry = await getOrCreatePetImage(d, PET);
        expect(retry.bytes.toString()).toBe('recovered');
    });

    it('writes nothing when generation fails, so the next request retries', async () => {
        const store = new MemoryImageStore();
        const generate = vi.fn().mockRejectedValue(new Error('nope'));

        await expect(
            getOrCreatePetImage(deps(store, generate as unknown as NonNullable<PipelineDeps['generate']>), PET),
        ).rejects.toThrow('nope');
        expect(store.size).toBe(0);
    });

    it('surfaces the store public URL when it has one', async () => {
        const store = new MemoryImageStore() as MemoryImageStore & ImageStore;
        store.publicUrl = (key: string) => `https://cdn.example/${key}`;
        const fake = fakeGenerator();

        const result = await getOrCreatePetImage(deps(store, fake.generate), PET);
        expect(result.url).toBe(`https://cdn.example/${petImageKey(PET)}`);
    });

    it('omits the URL for a store without one', async () => {
        const fake = fakeGenerator();
        const result = await getOrCreatePetImage(deps(new MemoryImageStore(), fake.generate), PET);
        expect(result.url).toBeUndefined();
    });
});
