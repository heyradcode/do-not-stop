import { describe, expect, it, vi } from 'vitest';

import type { WorkersAiConfig } from './config.js';
import { getOrCreateItemImage, UnknownItemError, type ItemArtManifest } from './itemPipeline.js';
import { buildItemPrompt, hasSubject, seedFromItemType } from './itemPrompt.js';
import { ITEM_CATALOG } from './items.js';
import type { PipelineDeps } from './pipeline.js';
import { itemImageKey, itemManifestKey, MemoryImageStore } from './store.js';
import { warmItems } from './warmItems.js';

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

const deps = (overrides: Partial<PipelineDeps> = {}): PipelineDeps & { generate: ReturnType<typeof vi.fn> } => {
    const generate = vi.fn(async () => Buffer.from('painted-bytes'));
    return {
        config: CONFIG,
        store: new MemoryImageStore(),
        generate: generate as unknown as NonNullable<PipelineDeps['generate']>,
        now: () => new Date('2026-08-08T12:00:00.000Z'),
        ...overrides,
    } as PipelineDeps & { generate: ReturnType<typeof vi.fn> };
};

describe('getOrCreateItemImage', () => {
    it('generates on a miss and stores the bytes under the item key', async () => {
        const d = deps();
        const result = await getOrCreateItemImage(d, '1');

        expect(result.cached).toBe(false);
        expect(result.key).toBe(itemImageKey('1'));
        expect(d.generate).toHaveBeenCalledOnce();
        expect(await d.store.get(itemImageKey('1'))).not.toBeNull();
    });

    // The property the whole design rests on. Marketplaces cache the first image they fetch,
    // so a second generation for the same item would mean two viewers seeing two objects.
    it('never generates twice for the same item', async () => {
        const d = deps();
        await getOrCreateItemImage(d, '1');
        const second = await getOrCreateItemImage(d, '1');

        expect(second.cached).toBe(true);
        expect(d.generate).toHaveBeenCalledOnce();
    });

    it('collapses concurrent first requests into one inference', async () => {
        const d = deps();
        const [a, b, c] = await Promise.all([
            getOrCreateItemImage(d, '3'),
            getOrCreateItemImage(d, '3'),
            getOrCreateItemImage(d, '3'),
        ]);

        expect(d.generate).toHaveBeenCalledOnce();
        expect([a.key, b.key, c.key]).toEqual([itemImageKey('3'), itemImageKey('3'), itemImageKey('3')]);
    });

    it('writes a manifest recording what produced the art', async () => {
        const d = deps();
        await getOrCreateItemImage(d, '201');

        const stored = await d.store.get(itemManifestKey('201'));
        const manifest = JSON.parse(stored!.bytes.toString()) as ItemArtManifest;
        expect(manifest.itemType).toBe('201');
        expect(manifest.key).toBe('founders_badge');
        expect(manifest.model).toBe(CONFIG.model);
        expect(manifest.seed).toBe(seedFromItemType('201'));
        expect(manifest.generatedAt).toBe('2026-08-08T12:00:00.000Z');
    });

    it('refuses an item type nobody defined rather than painting something', async () => {
        const d = deps();
        await expect(getOrCreateItemImage(d, '424242')).rejects.toBeInstanceOf(UnknownItemError);
        expect(d.generate).not.toHaveBeenCalled();
    });
});

describe('buildItemPrompt', () => {
    it('is deterministic', () => {
        for (const item of ITEM_CATALOG) {
            expect(buildItemPrompt(item)).toEqual(buildItemPrompt(item));
        }
    });

    it('has a written brief for every catalog item, not the category fallback', () => {
        const missing = ITEM_CATALOG.filter((i) => !hasSubject(i.key)).map((i) => i.key);
        expect(missing, `these items would fall back to a generic brief: ${missing.join(', ')}`).toEqual([]);
    });

    // Small clustered ids (1, 2, 3, 10, 11…) give visibly similar compositions on adjacent
    // seeds, which would make three weapons look like one render.
    it('spreads seeds across the range rather than tracking the token id', () => {
        const seeds = ITEM_CATALOG.map((i) => seedFromItemType(i.itemType));
        expect(new Set(seeds).size).toBe(seeds.length);
        expect(Math.min(...seeds)).toBeGreaterThan(1000);
    });

    it('escalates the finish with rarity', () => {
        const common = buildItemPrompt(ITEM_CATALOG.find((i) => i.rarity === 1)!);
        const legendary = buildItemPrompt(ITEM_CATALOG.find((i) => i.rarity === 5)!);
        expect(common.prompt).toContain('no glow');
        expect(legendary.prompt).toContain('legendary artifact');
    });

    it('forbids what would make an icon unreadable at tile size', () => {
        const { negativePrompt } = buildItemPrompt(ITEM_CATALOG[0]!);
        for (const banned of ['text', 'hands', 'multiple objects', 'scene', 'cropped']) {
            expect(negativePrompt).toContain(banned);
        }
    });
});

describe('warmItems', () => {
    it('generates the whole catalog once', async () => {
        const d = deps();
        const summary = await warmItems(d);

        expect(summary.total).toBe(ITEM_CATALOG.length);
        expect(summary.generated).toBe(ITEM_CATALOG.length);
        expect(d.generate).toHaveBeenCalledTimes(ITEM_CATALOG.length);
    });

    it('is safe to re-run', async () => {
        const d = deps();
        await warmItems(d);
        const again = await warmItems(d);

        expect(again.cached).toBe(ITEM_CATALOG.length);
        expect(again.generated).toBe(0);
        expect(d.generate).toHaveBeenCalledTimes(ITEM_CATALOG.length);
    });

    // A dry run that generates is worse than no dry run, because it bills for the answer.
    it('generates nothing on a dry run', async () => {
        const d = deps();
        const summary = await warmItems(d, { dryRun: true });

        expect(summary.wouldGenerate).toBe(ITEM_CATALOG.length);
        expect(d.generate).not.toHaveBeenCalled();
    });

    it('reports a failure and keeps going rather than abandoning the rest', async () => {
        const generate = vi.fn(async () => {
            if (generate.mock.calls.length === 2) throw new Error('model unavailable');
            return Buffer.from('painted-bytes');
        });
        const d = deps({ generate: generate as unknown as NonNullable<PipelineDeps['generate']> });

        const summary = await warmItems(d);

        expect(summary.failed).toBe(1);
        expect(summary.generated).toBe(ITEM_CATALOG.length - 1);
        expect(summary.events.find((e) => e.outcome === 'failed')?.error).toBe('model unavailable');
    });
});
