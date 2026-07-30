/**
 * The generate-once path: cache lookup, then Workers AI on a miss, then an
 * immutable write. Every consumer (CLI, HTTP) goes through here so no code path
 * can accidentally regenerate art for an existing pet.
 *
 * In-flight requests for the same pet are collapsed into one generation. Without
 * that, a pet's page loading in two tabs bills two inferences and races two
 * writers to the same key. The dedupe is per process: with several instances
 * behind a load balancer a simultaneous first-ever request for the same pet can
 * still generate twice, and both writes produce visually different images for
 * one key. R2 resolves it last-write-wins, so the pet ends up with one of the
 * two and stays stable afterwards. Closing that window properly needs a shared
 * lock, which is only worth adding if it shows up in practice.
 */

import type { WorkersAiConfig } from './config.js';
import { buildPetPrompt, summarisePet } from './prompt.js';
import type { Limiter } from './retry.js';
import type { ArtManifest, ImageStore, StoredObject } from './store.js';
import { ART_VERSION, encodeManifest, petImageKey, petManifestKey } from './store.js';
import { derivePetVisualTraits, type PetArtInput } from './traits.js';
import { generateImage } from './workersAi.js';

export interface PipelineDeps {
    config: WorkersAiConfig;
    store: ImageStore;
    /** Injected for tests; defaults to the real Workers AI call. */
    generate?: typeof generateImage;
    now?: () => Date;
    /** Bounds simultaneous generations. Without one, a marketplace crawling a
     *  collection's images turns into N concurrent Workers AI calls. */
    limiter?: Limiter;
}

export interface PetImageResult extends StoredObject {
    key: string;
    /** False when this request paid for an inference. */
    cached: boolean;
    /** Set when the store exposes a public URL for the key. */
    url?: string;
    /** One-line description of the pet, for metadata and logs. */
    summary: string;
}

/**
 * In-flight generations, scoped per store rather than held in one module-level
 * map. The key alone does not identify the work: two stores asked for the same
 * pet are two separate generations, and a global map would hand the second
 * caller a promise that writes somewhere it cannot read. Production runs a single
 * store, but tests build many, and a WeakMap costs nothing to get right.
 */
const inFlightByStore = new WeakMap<ImageStore, Map<string, Promise<PetImageResult>>>();

const inFlightFor = (store: ImageStore): Map<string, Promise<PetImageResult>> => {
    let map = inFlightByStore.get(store);
    if (!map) {
        map = new Map();
        inFlightByStore.set(store, map);
    }
    return map;
};

export const getOrCreatePetImage = async (
    deps: PipelineDeps,
    input: PetArtInput,
): Promise<PetImageResult> => {
    const key = petImageKey(input);

    const cached = await deps.store.get(key);
    if (cached) return describe(deps, key, cached, true, input);

    const inFlight = inFlightFor(deps.store);
    const pending = inFlight.get(key);
    if (pending) return pending;

    const work = generateAndStore(deps, key, input).finally(() => inFlight.delete(key));
    inFlight.set(key, work);
    return work;
};

const generateAndStore = async (
    deps: PipelineDeps,
    key: string,
    input: PetArtInput,
): Promise<PetImageResult> => {
    const traits = derivePetVisualTraits(input);
    const spec = buildPetPrompt(traits, input.dna);
    const generate = deps.generate ?? generateImage;

    // Queued rather than shed when the limiter is full: a caller waiting a few
    // seconds beats telling them their pet has no image.
    const bytes = deps.limiter
        ? await deps.limiter.run(() => generate(deps.config, spec))
        : await generate(deps.config, spec);
    const object: StoredObject = { bytes, contentType: 'image/png' };

    const manifest: ArtManifest = {
        artVersion: ART_VERSION,
        dna: input.dna.toString(),
        rarity: input.rarity,
        speciesId: input.speciesId ?? null,
        traits: { ...traits },
        model: deps.config.model,
        prompt: spec.prompt,
        negativePrompt: spec.negativePrompt,
        seed: spec.seed,
        bytes: bytes.length,
        generatedAt: (deps.now?.() ?? new Date()).toISOString(),
    };

    // Image first: a manifest with no image would be a cache miss forever, while
    // an image with no manifest still serves correctly and only loses provenance.
    await deps.store.put(key, object);
    await deps.store.put(petManifestKey(input), encodeManifest(manifest));

    return describe(deps, key, object, false, input);
};

const describe = (
    deps: PipelineDeps,
    key: string,
    object: StoredObject,
    cached: boolean,
    input: PetArtInput,
): PetImageResult => {
    const url = deps.store.publicUrl?.(key);
    return {
        ...object,
        key,
        cached,
        summary: summarisePet(derivePetVisualTraits(input)),
        ...(url ? { url } : {}),
    };
};
