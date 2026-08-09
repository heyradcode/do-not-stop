/**
 * Deterministic static art for the item catalog (roadmap §4).
 *
 * Static, not generated. A pet's art is a function of its DNA and every pet is a different
 * one; an item's token id *is* its type, so all 47 copies of an Iron Fang are one object with
 * one picture. Running inference for that would pay per-request for an answer that never
 * changes, and would not even be stable — marketplaces cache the first image they fetch, so
 * art that varies between calls is art that varies between viewers, permanently.
 *
 * So: pure function of the catalog entry, no clock, no randomness, no network, no store.
 * The same item renders byte-identical on every machine forever, which is what lets the route
 * serve it with a long cache lifetime and no R2 round trip.
 *
 * Drawn with presentation attributes rather than a `<style>` block on purpose. Marketplaces
 * and wallets routinely sanitise SVG before rendering, and a stripped stylesheet leaves an
 * invisible glyph; attributes survive. The glow filter is the one exception, and everything
 * stays legible with it removed — it is decoration, not structure.
 *
 * Geometry: a 512 square, glyphs living inside roughly 110-410 so nothing touches the frame
 * at any render size. They stay iconic rather than illustrative, which is both honest about
 * what fits in a 64px inventory tile and consistent with the game's HUD look.
 */

import { RARITY_NAMES, SLOT_NAMES, type ItemDefinition } from './items.js';

/** Neutral edge colour, matching the app's body text on dark panels. */
const STEEL = '#C3D2FF';

/** Rarity tints, identical to `getRarityColor` in shared/src/utils/pets/cosmetics.ts. One
 *  vocabulary across pets and items was roadmap §4's requirement; a second palette here
 *  would make a Legendary item and a Legendary pet different colours. */
const RARITY_TINTS: Record<number, string> = {
    1: '#8B4513',
    2: '#C0C0C0',
    3: '#FFD700',
    4: '#FF69B4',
    5: '#8A2BE2',
};

const tintOf = (rarity: number): string => RARITY_TINTS[rarity] ?? RARITY_TINTS[1]!;

const esc = (value: string): string =>
    value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

const line = (d: string, colour: string, width = 14): string =>
    `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"/>`;

const solid = (d: string, colour: string, opacity = 1): string =>
    `<path d="${d}" fill="${colour}"${opacity === 1 ? '' : ` fill-opacity="${opacity}"`}/>`;

const dot = (cx: number, cy: number, r: number, colour: string, opacity = 1): string =>
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${colour}"${opacity === 1 ? '' : ` fill-opacity="${opacity}"`}/>`;

const ring = (cx: number, cy: number, r: number, colour: string, width = 14): string =>
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${colour}" stroke-width="${width}"/>`;

/** A flask outline, shared by the three consumables so they read as one family. */
const flask = (tint: string, liquidTopY: number, uid: string): string[] => {
    const body =
        'M236 206 C178 246 154 300 154 338 C154 384 200 412 256 412 C312 412 358 384 358 338 C358 300 334 246 276 206 Z';
    return [
        // Liquid first, clipped to the body by drawing the outline over it.
        `<clipPath id="flaskBody-${uid}"><path d="${body}"/></clipPath>`,
        `<g clip-path="url(#flaskBody-${uid})">${solid(
            `M120 ${liquidTopY} L392 ${liquidTopY} L392 430 L120 430 Z`,
            tint,
            0.85,
        )}</g>`,
        line(body, STEEL),
        line('M238 208 L238 150 M274 208 L274 150', STEEL),
        line('M222 132 L290 132', STEEL, 22),
    ];
};

/** Five-pointed star, for the founder's badge. */
const star = (cx: number, cy: number, outer: number, inner: number): string => {
    const points: string[] = [];
    for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? outer : inner;
        const angle = (Math.PI / 5) * i - Math.PI / 2;
        points.push(`${(cx + r * Math.cos(angle)).toFixed(1)} ${(cy + r * Math.sin(angle)).toFixed(1)}`);
    }
    return `M${points.join(' L')} Z`;
};

/**
 * One glyph per catalog key. Keyed by `key` rather than token id because the key is the
 * identifier the catalog promises to keep stable; ids are banded for readability only.
 */
const GLYPHS: Record<string, (tint: string, uid: string) => string[]> = {
    // ── weapons ──────────────────────────────────────────────────────────────
    iron_fang: (tint) => [
        solid('M256 104 L292 178 L292 306 L220 306 L220 178 Z', tint, 0.55),
        line('M256 104 L292 178 L292 306 L220 306 L220 178 Z', STEEL),
        // The chip the description promises, cut from the leading edge.
        solid('M292 214 L268 232 L292 250 Z', '#050D1E'),
        line('M186 306 L326 306', STEEL, 24),
        line('M256 318 L256 386', STEEL, 26),
        ring(256, 404, 16, tint, 12),
    ],
    storm_talon: (tint) => [
        solid('M344 120 C262 166 198 266 190 382 L242 382 C250 288 296 196 356 148 Z', tint, 0.5),
        line('M344 120 C262 166 198 266 190 382', STEEL),
        line('M356 148 C296 196 250 288 242 382', STEEL),
        line('M190 382 L242 382', STEEL),
        line('M300 152 L280 200 L308 194 L286 244', tint, 12),
    ],
    sunder_maul: (tint) => [
        solid('M150 124 L362 124 L362 244 L150 244 Z', tint, 0.5),
        line('M150 124 L362 124 L362 244 L150 244 Z', STEEL),
        line('M196 124 L196 244 M316 124 L316 244', STEEL, 10),
        line('M256 250 L256 404', STEEL, 30),
        line('M224 248 L288 248', STEEL, 20),
    ],

    // ── armor ────────────────────────────────────────────────────────────────
    hide_vest: (tint) => [
        solid('M180 148 L256 190 L332 148 L360 218 L332 240 L332 400 L180 400 L180 240 L152 218 Z', tint, 0.45),
        line('M180 148 L256 190 L332 148 L360 218 L332 240 L332 400 L180 400 L180 240 L152 218 Z', STEEL),
        line('M256 214 L256 386', STEEL, 8),
        line('M232 250 L280 250 M232 296 L280 296 M232 342 L280 342', tint, 10),
    ],
    scale_mail: (tint) => [
        solid('M180 148 L256 190 L332 148 L360 218 L332 240 L332 400 L180 400 L180 240 L152 218 Z', tint, 0.45),
        line('M180 148 L256 190 L332 148 L360 218 L332 240 L332 400 L180 400 L180 240 L152 218 Z', STEEL),
        line('M196 262 A28 24 0 0 1 252 262 A28 24 0 0 1 308 262', STEEL, 9),
        line('M196 316 A28 24 0 0 1 252 316 A28 24 0 0 1 308 316', STEEL, 9),
        line('M196 370 A28 24 0 0 1 252 370 A28 24 0 0 1 308 370', STEEL, 9),
    ],
    aegis_carapace: (tint) => [
        solid('M256 118 C342 118 398 190 398 270 C398 352 336 406 256 406 C176 406 114 352 114 270 C114 190 170 118 256 118 Z', tint, 0.45),
        line('M256 118 C342 118 398 190 398 270 C398 352 336 406 256 406 C176 406 114 352 114 270 C114 190 170 118 256 118 Z', STEEL),
        line('M150 232 C200 206 312 206 362 232', STEEL, 10),
        line('M132 296 C196 262 316 262 380 296', STEEL, 10),
        line('M256 118 L256 406', STEEL, 8),
    ],

    // ── trinkets ─────────────────────────────────────────────────────────────
    river_charm: (tint) => [
        line('M164 132 C212 188 300 188 348 132', STEEL, 10),
        solid('M256 194 C300 250 320 288 320 316 C320 354 291 382 256 382 C221 382 192 354 192 316 C192 288 212 250 256 194 Z', tint, 0.6),
        line('M256 194 C300 250 320 288 320 316 C320 354 291 382 256 382 C221 382 192 354 192 316 C192 288 212 250 256 194 Z', STEEL),
        line('M232 320 C232 300 240 282 252 266', '#FFFFFF', 8),
    ],
    focus_sigil: (tint) => [
        solid('M256 118 L394 256 L256 394 L118 256 Z', tint, 0.4),
        line('M256 118 L394 256 L256 394 L118 256 Z', STEEL),
        line('M176 256 C210 214 302 214 336 256 C302 298 210 298 176 256 Z', STEEL, 12),
        dot(256, 256, 26, tint),
        dot(256, 256, 11, '#050D1E'),
    ],

    // ── consumables ──────────────────────────────────────────────────────────
    xp_potion_i: (tint, uid) => flask(tint, 330, uid),
    xp_potion_ii: (tint, uid) => [
        ...flask(tint, 262, uid),
        line('M196 366 L316 366', tint, 8),
    ],
    cooldown_draught: (tint, uid) => [
        ...flask(tint, 300, uid),
        line('M212 344 C240 316 272 372 300 344', '#FFFFFF', 9),
    ],

    // ── collectibles ─────────────────────────────────────────────────────────
    crate_key: (tint) => [
        ring(176, 256, 62, STEEL, 22),
        ring(176, 256, 24, tint, 14),
        line('M238 256 L404 256', STEEL, 26),
        line('M352 268 L352 320', STEEL, 20),
        line('M396 268 L396 306', STEEL, 20),
    ],
    founders_badge: (tint) => [
        solid('M256 108 L386 156 L386 274 C386 344 330 390 256 414 C182 390 126 344 126 274 L126 156 Z', tint, 0.5),
        line('M256 108 L386 156 L386 274 C386 344 330 390 256 414 C182 390 126 344 126 274 L126 156 Z', STEEL),
        solid(star(256, 262, 78, 32), tint),
        line(star(256, 262, 78, 32), STEEL, 8),
    ],

    // ── materials ────────────────────────────────────────────────────────────
    ember_shard: (tint) => [
        solid('M256 106 L320 214 L296 344 L256 404 L216 344 L192 214 Z', tint, 0.6),
        line('M256 106 L320 214 L296 344 L256 404 L216 344 L192 214 Z', STEEL),
        line('M192 214 L320 214 M256 106 L256 404', STEEL, 8),
        dot(256, 260, 20, '#FFFFFF', 0.25),
    ],
    void_dust: (tint) => [
        dot(256, 250, 34, tint, 0.9),
        dot(190, 196, 20, tint, 0.7),
        dot(330, 210, 15, tint, 0.6),
        dot(344, 300, 25, tint, 0.75),
        dot(186, 322, 18, tint, 0.6),
        dot(276, 356, 13, tint, 0.5),
        dot(226, 288, 9, STEEL, 0.5),
        dot(306, 268, 7, STEEL, 0.45),
        line('M150 368 C210 330 300 400 372 340', tint, 7),
    ],
};

/** Drawn when a catalog entry has no glyph, so a new item ships plain rather than blank. */
const fallbackGlyph = (tint: string, _uid: string): string[] => [
    solid('M256 120 L376 190 L376 322 L256 392 L136 322 L136 190 Z', tint, 0.4),
    line('M256 120 L376 190 L376 322 L256 392 L136 322 L136 190 Z', STEEL),
    dot(256, 256, 22, STEEL, 0.6),
];

/** True when this item has art of its own rather than the fallback. Exported for the test
 *  that holds the catalog and the glyph table to the same length. */
export const hasGlyph = (key: string): boolean => key in GLYPHS;

/**
 * Renders `item` as a standalone SVG document.
 *
 * Pure and total: any catalog entry returns a document, and an unknown key falls back to a
 * plain crest rather than throwing, because a missing glyph should degrade to dull art
 * instead of a broken image in somebody's wallet.
 */
export const renderItemSvg = (item: ItemDefinition): string => {
    const tint = tintOf(item.rarity);
    const glyph = (GLYPHS[item.key] ?? fallbackGlyph)(tint, item.key);
    const label = `${item.name} — ${RARITY_NAMES[item.rarity] ?? 'Unknown'} ${
        item.slot ? SLOT_NAMES[{ weapon: 0, armor: 1, trinket: 2 }[item.slot]] : item.category
    }`;

    return [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img"',
        ` aria-label="${esc(label)}">`,
        `<title>${esc(item.name)}</title>`,
        `<desc>${esc(item.description)}</desc>`,
        '<defs>',
        `<radialGradient id="bg-${item.key}" cx="50%" cy="42%" r="72%">`,
        `<stop offset="0%" stop-color="${tint}" stop-opacity="0.22"/>`,
        '<stop offset="100%" stop-color="#050D1E" stop-opacity="1"/>',
        '</radialGradient>',
        `<filter id="glow-${item.key}" x="-25%" y="-25%" width="150%" height="150%">`,
        '<feGaussianBlur stdDeviation="7" result="b"/>',
        '<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>',
        '</filter>',
        '</defs>',
        '<rect width="512" height="512" fill="#050D1E"/>',
        `<rect width="512" height="512" fill="url(#bg-${item.key})"/>`,
        `<rect x="14" y="14" width="484" height="484" rx="18" fill="none" stroke="${tint}" stroke-width="5" stroke-opacity="0.65"/>`,
        `<g filter="url(#glow-${item.key})">${glyph.join('')}</g>`,
        '</svg>',
    ].join('');
};
