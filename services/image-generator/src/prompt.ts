/**
 * Traits -> text-to-image prompt. Pure and deterministic: the same pet always
 * produces the same prompt string, negative prompt, and seed, so a generated
 * image can be re-derived from DNA alone rather than only from whatever the
 * model happened to return the first time.
 *
 * Determinism stops at this module's edge. Diffusion output is reproducible for
 * a fixed (model, prompt, seed, size, steps) tuple *on one model version*, and
 * not across versions or providers, so a pet's art is authoritative only once
 * cached (see store.ts). This file's job is to make the input side stable.
 *
 * No LLM writes the prompt. An LLM would reintroduce nondeterminism and a
 * second inference cost for something a lookup table does exactly.
 */

import {
    BODY_NAMES,
    ELEMENT_NAMES,
    EYE_NAMES,
    MARKING_NAMES,
    RARITY_NAMES,
    type PetVisualTraits,
} from './traits.js';

/** Palette and mood per element, indexed like ELEMENT_NAMES. */
const ELEMENT_PROMPTS = [
    'molten orange and ember red colours, drifting embers and heat haze',
    'deep teal and aqua colours, flowing water and rising bubbles',
    'electric yellow and violet colours, crackling arcs of lightning',
    'verdant green and moss colours, curling leaves and vines',
    'indigo and charcoal colours, coiling smoke and dark mist',
    'starlit violet and cyan colours, nebula dust and drifting sparks',
] as const;

/** Creature archetype per body, indexed like BODY_NAMES (= skill archetype). */
const BODY_PROMPTS = [
    'a stocky armour-plated beast with a broad shielded back',
    'a turtle-like creature carrying a thick ridged shell',
    'a slender fox-like creature built for speed, long tapered tail',
    'a lithe cat-like creature with a sly narrow face and tufted ears',
    'a muscular horned brute with heavy shoulders and clenched claws',
    'an owl-like mystic creature with glowing arcane sigils in its plumage',
    'a winged phoenix-like bird with long trailing tail feathers',
    'a wolf-like predator with bared fangs and a bristling ruff',
] as const;

const PATTERN_PROMPTS = [
    'a smooth solid coat',
    'a spotted coat',
    'a striped coat',
    'a two-tone patched coat',
    'a dappled gradient coat',
] as const;

const EYE_PROMPTS = [
    'large round friendly eyes',
    'sharp narrowed eyes',
    'heavy-lidded sleepy eyes',
    'fierce blazing eyes',
] as const;

const MARKING_PROMPTS = [
    'no facial markings',
    'a dark mask across the eyes',
    'a bright blaze running down the muzzle',
    'rounded blush patches on the cheeks',
    'a crown-shaped marking on the brow',
] as const;

/** Framing and finish per rarity tier, indexed like RARITY_NAMES (aura). */
const AURA_PROMPTS = [
    'plain matte finish, no glow',
    'a faint rim light',
    'a soft glowing aura',
    'an ornate luminous aura with floating motes',
    'a brilliant radiant aura, gilded ornamental filigree, floating runes',
] as const;

/** Fixed style contract. Every pet shares it so a collection reads as one set
 *  instead of eight unrelated art styles. */
const STYLE = [
    'cute chibi collectible creature character',
    'centered full body, facing the viewer, single subject',
    'clean stylised game art, crisp bold outlines, soft studio lighting',
    'plain dark vignette background',
    'high detail, 1:1 square composition',
].join(', ');

/** Kept in sync with STYLE: whatever STYLE promises, this forbids the opposite. */
const NEGATIVE_PROMPT = [
    'text, letters, watermark, signature, logo',
    'human, humanoid, person, face closeup',
    'multiple creatures, duplicate subject, extra limbs, extra heads',
    'cropped, out of frame, cut off',
    'blurry, low quality, jpeg artifacts, noisy',
    'photorealistic, photograph, 3d render',
    'busy background, cluttered scene',
].join(', ');

/** SDXL takes a uint32-ish seed; DNA is 16 digits, so fold it down. */
const SEED_MODULUS = 2_147_483_647n;

export interface PetPromptSpec {
    prompt: string;
    negativePrompt: string;
    /** Stable per-pet seed, derived from DNA. */
    seed: number;
}

const buildDescriptor = (value: number, options: readonly string[]): string => options[value]!;

/** Body girth from the HP gene (0-99). */
const buildPrompt = (traits: PetVisualTraits): string => {
    const girth = traits.build < 33 ? 'slight wiry frame' : traits.build < 67 ? 'sturdy frame' : 'heavyset frame';
    const glow = traits.spark < 50 ? 'a soft inner glow' : 'an intense inner glow';

    return [
        buildDescriptor(traits.body, BODY_PROMPTS),
        `a ${girth}`,
        buildDescriptor(traits.pattern, PATTERN_PROMPTS),
        `${buildDescriptor(traits.eyes, EYE_PROMPTS)} with ${glow}`,
        buildDescriptor(traits.marking, MARKING_PROMPTS),
        `${ELEMENT_NAMES[traits.element]!.toLowerCase()} elemental creature, ${buildDescriptor(traits.element, ELEMENT_PROMPTS)}`,
        buildDescriptor(traits.aura, AURA_PROMPTS),
        STYLE,
    ].join(', ');
};

/** Fold DNA into a seed. Uses the whole DNA rather than the cosmetic pair alone
 *  so two pets that share cosmetics still get different compositions. */
export const seedFromDna = (dna: bigint): number => Number(((dna % SEED_MODULUS) + SEED_MODULUS) % SEED_MODULUS);

export const buildPetPrompt = (traits: PetVisualTraits, dna: bigint): PetPromptSpec => ({
    prompt: buildPrompt(traits),
    negativePrompt: NEGATIVE_PROMPT,
    seed: seedFromDna(dna),
});

/** Short human-facing summary of a pet's look, for metadata `description` and
 *  for logs where the full prompt is too long to be useful. */
export const summarisePet = (traits: PetVisualTraits): string =>
    `${RARITY_NAMES[traits.aura]!} ${ELEMENT_NAMES[traits.element]!} ${BODY_NAMES[traits.body]!}`
    + ` with ${PATTERN_PROMPTS[traits.pattern]!.replace(/^a /, '')},`
    + ` ${EYE_NAMES[traits.eyes]!.toLowerCase()} eyes,`
    + ` and ${MARKING_NAMES[traits.marking]! === 'None' ? 'no markings' : `a ${MARKING_NAMES[traits.marking]!.toLowerCase()} marking`}.`;
