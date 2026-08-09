/**
 * Catalog entry -> text-to-image prompt for item art (roadmap §4).
 *
 * Same contract as `prompt.ts`: pure, deterministic, no LLM. The same item always produces
 * the same prompt, negative prompt and seed, so art can be re-derived from the catalog rather
 * than only from whatever the model happened to return first. Determinism stops at this
 * module's edge for the same reason it does for pets — diffusion is reproducible for a fixed
 * (model, prompt, seed, size, steps) tuple on one model version and not across versions — so
 * an item's art is authoritative only once cached.
 *
 * The look is the ARPG inventory-icon convention: one object, shot like a museum piece
 * against a dark ground, painterly rather than photographic, lit hard enough to read at
 * 64px. That last constraint is doing real work. An inventory tile is small, so the prompt
 * asks for a single silhouette filling the frame and forbids scenes, hands, and props —
 * three of the four ways a generated item icon usually becomes unreadable when scaled down.
 *
 * Written per catalog key rather than derived from the name, because "Second Wind" and
 * "Void Dust" describe an effect, not an object, and a model given only the name paints
 * something arbitrary. The table is what turns a catalog row into a picture brief.
 */

import { RARITY_NAMES, type ItemDefinition } from './items.js';

/** What the object physically is. Keyed like the glyph table, on the stable content key. */
const ITEM_SUBJECTS: Record<string, string> = {
    // ── weapons ──────────────────────────────────────────────────────────────
    iron_fang: 'crude short iron dagger with a chipped notched blade, leather-wrapped grip, pitted scratched metal',
    storm_talon: 'curved raptor-claw sword of blued steel, arcs of electricity crawling along its cutting edge',
    // Twice-burned, so deliberately the plainest brief in the table. "rune-carved head"
    // produced a carved stone skull; rewriting it as "a huge block of carved granite" made
    // the block the subject and produced a monolith. A warhammer is a concept the model
    // already knows — the fix was to stop describing it.
    sunder_maul: 'colossal two-handed stone warhammer with a long wooden handle',
    // ── armor ────────────────────────────────────────────────────────────────
    hide_vest: 'rough leather jerkin of stitched animal hide, frayed cord lacing, worn and travel-stained',
    scale_mail: 'scale-mail cuirass of overlapping metal scales, riveted leather straps, dull battle-scarred steel',
    // "carapace" and "shell" both read as seashell here, and a shell repeats: the first
    // attempt came back as a seamless tiled pattern of scallops.
    aegis_carapace: 'fantasy breastplate armour of layered dark chitin plates with glowing golden seams',
    // ── trinkets ─────────────────────────────────────────────────────────────
    river_charm: 'smooth river-stone amulet on a braided cord, water beading and running over its polished surface',
    focus_sigil: 'floating arcane amulet, thin gold rings orbiting a single violet gemstone at its centre',
    // ── consumables ──────────────────────────────────────────────────────────
    xp_potion_i: 'small round glass potion vial half full of dull copper-coloured liquid, cork stopper',
    xp_potion_ii: 'ornate faceted glass potion flask brimming with luminous amber elixir, gold collar, glass stopper',
    cooldown_draught: 'tall slender glass potion bottle of pale blue-green liquid, a curling wisp of vapour at its neck',
    // ── collectibles ─────────────────────────────────────────────────────────
    crate_key: 'ornate brass skeleton key with a scrollwork bow and sharp cut wards, faintly tarnished',
    founders_badge: 'heraldic medallion of dark gold with a five-pointed star at its centre, engraved laurel border',
    // ── materials ────────────────────────────────────────────────────────────
    ember_shard: 'jagged shard of volcanic glass with molten orange light glowing from the fractures inside it',
    void_dust: 'small open glass jar of fine iridescent black dust, motes drifting upward from its mouth',
};

/** Fallback so an item added to the catalog before its brief still generates something in
 *  the right family rather than a scene. */
const CATEGORY_SUBJECTS: Record<string, string> = {
    equipment: 'piece of ornate fantasy adventuring equipment',
    consumable: 'small glass potion bottle with a stopper',
    collectible: 'rare ornamental fantasy trinket',
    material: 'raw fantasy crafting material',
};

/**
 * Finish per rarity tier. Rarity is the one catalog field that should be visible at a glance
 * in a bag full of icons, and it is the same five tiers pets use.
 */
const RARITY_FINISH = [
    '', // no tier 0
    'plain worn everyday craftsmanship, no glow, muted earthy colours',
    'well-kept craftsmanship with a faint cool rim light, restrained silver accents',
    'fine craftsmanship, a warm golden glow, gilded inlay',
    'masterwork craftsmanship, a vivid magical aura and drifting motes of light',
    'legendary artifact, brilliant radiant energy, a blazing aura, floating embers',
] as const;
// No "runes", "filigree" or "intricate" above, learned the hard way. Several subjects are
// already rune-carved or ornate, and stacking the two turned a two-handed warhammer into a
// symmetrical rune mandala — the object dissolved into the decoration describing it.

/**
 * The style contract every item shares, so 15 icons read as one set rather than 15
 * unrelated illustrations. Deliberately specific about framing and background: those are
 * what make an icon legible in a small tile, not the level of detail.
 */
const STYLE = [
    'hand-painted fantasy game item art, painterly digital illustration, rich brushwork',
    'one single object, centred, filling the frame, floating against a plain dark background',
    'dramatic lighting with a strong rim light and deep shadow, high contrast, saturated colour',
    'sharp readable silhouette, tactile material detail, square composition',
].join(', ');
// Deliberately never says "icon". Naming Dota 2 or MOBA inventory icons pulls the model
// toward the *frame* those icons are drawn in — a square ornamental panel — rather than the
// object inside it. Describing the look instead of naming the genre gets the painting
// without the UI chrome.

/** Kept in step with STYLE: whatever STYLE promises, this forbids the opposite. */
const NEGATIVE_PROMPT = [
    'text, letters, numbers, watermark, signature, logo',
    'ui frame, border, picture frame, tooltip, panel, plaque, card',
    'mandala, kaleidoscope, symmetrical ornament, decorative pattern, wallpaper, tiled',
    'hands, arms, person, character, creature, face',
    'multiple objects, duplicate item, collection, set, scattered debris, small props',
    'scene, landscape, room, table, floor, shelf, ground plane, background clutter',
    'cropped, out of frame, cut off, off-centre',
    'blurry, low quality, jpeg artifacts, flat vector, clipart',
    'photorealistic, photograph, 3d render, cgi',
].join(', ');

/** SDXL takes a uint32-ish seed. */
const SEED_MODULUS = 2_147_483_647;

export interface ItemPromptSpec {
    prompt: string;
    negativePrompt: string;
    /** Stable per-item seed. */
    seed: number;
}

/**
 * Seed from the token id, mixed rather than used raw.
 *
 * The catalog's ids are small and clustered (1, 2, 3, 10, 11, …), and adjacent seeds on a
 * diffusion model give visibly similar compositions — three weapons that look like the same
 * render. Mixing spreads them across the range so each item gets an unrelated starting
 * point, while staying a pure function of the id.
 */
export const seedFromItemType = (itemType: string): number => {
    let hash = 0x811c9dc5;
    for (const char of `item:${itemType}`) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash % SEED_MODULUS;
};

export const buildItemPrompt = (item: ItemDefinition): ItemPromptSpec => {
    const subject = ITEM_SUBJECTS[item.key] ?? CATEGORY_SUBJECTS[item.category] ?? CATEGORY_SUBJECTS.material!;
    const finish = RARITY_FINISH[item.rarity] ?? RARITY_FINISH[1]!;

    return {
        /**
         * "one single X, alone on a plain solid black background" leads, then the rest of
         * the composition, then the rarity finish last.
         *
         * That order is not cosmetic. This model barely honours the negative prompt at eight
         * steps — asking it there for one object on a plain ground produced two daggers on a
         * lit tabletop and a tiled wallpaper of shells. Diffusion weights early tokens
         * hardest, so the two constraints that kept failing are now the first thing in the
         * positive prompt, and the rarity language lands last where it decorates an object
         * already established rather than competing to be the subject.
         */
        prompt: [`one single ${subject}`, 'alone on a plain solid black background', STYLE, finish].join(', '),
        negativePrompt: NEGATIVE_PROMPT,
        seed: seedFromItemType(item.itemType),
    };
};

/** True when this item has a written brief rather than the category fallback. Exported so a
 *  test can hold the catalog and the brief table to the same length. */
export const hasSubject = (key: string): boolean => key in ITEM_SUBJECTS;

/** Short human-facing summary, for logs and the warm CLI. */
export const summariseItem = (item: ItemDefinition): string =>
    `${RARITY_NAMES[item.rarity] ?? 'Unknown'} ${item.category} — ${item.name}`;
