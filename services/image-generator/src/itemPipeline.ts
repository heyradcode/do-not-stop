/**
 * The generate-once path for item art (roadmap §4), mirroring `pipeline.ts`.
 *
 * Deliberately the same shape as the pet pipeline — cache lookup, in-flight dedupe, Workers
 * AI on a miss, immutable write — because the property that matters is identical: an item's
 * art must be generated once and then never change. Marketplaces cache the first image they
 * fetch, so art that varies between calls varies between viewers permanently. Generation is
 * nondeterministic; the *store* is what makes the result stable.
 *
 * The economics are much kinder here than for pets. There are 15 item types rather than one
 * per pet, they are shared by every holder, and `warmItems` can generate the whole catalog in
 * one command ahead of a deploy — so in steady state every request is a cache hit and the
 * bill does not grow with the player base.
 *
 * A separate module rather than a generic over the pet one: the two share a silhouette but
 * not their inputs (`PetArtInput` vs a catalog row), their keys (digest vs token id), or
 * their manifests. Unifying them would mean a type parameter threaded through every field
 * to save a cache-then-generate that is eight lines long.
 */

import { findItem, type ItemDefinition } from './items.js';
import { buildItemPrompt, summariseItem } from './itemPrompt.js';
import type { PipelineDeps } from './pipeline.js';
import type { StoredObject } from './store.js';
import { ART_VERSION, itemImageKey, itemManifestKey } from './store.js';
import { generateImage } from './workersAi.js';

export class UnknownItemError extends Error {
    constructor(readonly itemType: string) {
        super(`Unknown item type ${itemType}`);
        this.name = 'UnknownItemError';
    }
}

export interface ItemImageResult extends StoredObject {
    key: string;
    /** False when this request paid for an inference. */
    cached: boolean;
    url?: string;
    summary: string;
}

/** Provenance sidecar, the item counterpart of `ArtManifest`. */
export interface ItemArtManifest {
    artVersion: number;
    itemType: string;
    key: string;
    rarity: number;
    model: string;
    prompt: string;
    negativePrompt: string;
    seed: number;
    bytes: number;
    generatedAt: string;
}

/** Per-store, for the reason `pipeline.ts` documents: two stores asked for the same item are
 *  two separate generations, and a global map would hand the second caller a promise that
 *  writes somewhere it cannot read. */
const inFlightByStore = new WeakMap<object, Map<string, Promise<ItemImageResult>>>();

const inFlightFor = (store: object): Map<string, Promise<ItemImageResult>> => {
    let map = inFlightByStore.get(store);
    if (!map) {
        map = new Map();
        inFlightByStore.set(store, map);
    }
    return map;
};

export const getOrCreateItemImage = async (
    deps: PipelineDeps,
    itemType: string,
): Promise<ItemImageResult> => {
    const item = findItem(itemType);
    if (!item) throw new UnknownItemError(itemType);

    const key = itemImageKey(item.itemType);

    const cached = await deps.store.get(key);
    if (cached) return describe(deps, key, cached, true, item);

    const inFlight = inFlightFor(deps.store);
    const pending = inFlight.get(key);
    if (pending) return pending;

    const work = generateAndStore(deps, key, item).finally(() => inFlight.delete(key));
    inFlight.set(key, work);
    return work;
};

const generateAndStore = async (
    deps: PipelineDeps,
    key: string,
    item: ItemDefinition,
): Promise<ItemImageResult> => {
    const spec = buildItemPrompt(item);
    const generate = deps.generate ?? generateImage;

    const bytes = deps.limiter
        ? await deps.limiter.run(() => generate(deps.config, spec))
        : await generate(deps.config, spec);
    const object: StoredObject = { bytes, contentType: 'image/png' };

    const manifest: ItemArtManifest = {
        artVersion: ART_VERSION,
        itemType: item.itemType,
        key: item.key,
        rarity: item.rarity,
        model: deps.config.model,
        prompt: spec.prompt,
        negativePrompt: spec.negativePrompt,
        seed: spec.seed,
        bytes: bytes.length,
        generatedAt: (deps.now?.() ?? new Date()).toISOString(),
    };

    // Image first, manifest second: a manifest with no image is a cache miss forever, while
    // an image with no manifest still serves and only loses provenance.
    await deps.store.put(key, object);
    await deps.store.put(itemManifestKey(item.itemType), {
        bytes: Buffer.from(JSON.stringify(manifest, null, 2)),
        contentType: 'application/json; charset=utf-8',
    });

    return describe(deps, key, object, false, item);
};

const describe = (
    deps: PipelineDeps,
    key: string,
    object: StoredObject,
    cached: boolean,
    item: ItemDefinition,
): ItemImageResult => {
    const url = deps.store.publicUrl?.(key);
    return { ...object, key, cached, summary: summariseItem(item), ...(url ? { url } : {}) };
};
