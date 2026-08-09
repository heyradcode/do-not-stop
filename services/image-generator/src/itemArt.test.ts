import { describe, expect, it } from 'vitest';

import { hasGlyph, renderItemSvg } from './itemArt.js';
import { ITEM_CATALOG, type ItemDefinition } from './items.js';

describe('renderItemSvg', () => {
    it.each(ITEM_CATALOG.map((i) => [i.key, i] as const))('renders %s as a complete document', (_key, item) => {
        const svg = renderItemSvg(item);
        expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
        expect(svg.endsWith('</svg>')).toBe(true);
        expect(svg).toContain('viewBox="0 0 512 512"');
    });

    // The whole reason this is static rather than generated: marketplaces cache the first
    // image they fetch, so art that varies between calls varies between viewers forever.
    it('is byte-identical across calls', () => {
        for (const item of ITEM_CATALOG) {
            expect(renderItemSvg(item)).toBe(renderItemSvg(item));
        }
    });

    // A fallback exists so a new catalog entry ships plain rather than blank, but nothing
    // currently shipped should be using it.
    it('has real art for every catalog item, not the fallback', () => {
        const missing = ITEM_CATALOG.filter((item) => !hasGlyph(item.key)).map((i) => i.key);
        expect(missing, `these items would render the fallback crest: ${missing.join(', ')}`).toEqual([]);
    });

    it('still renders an item whose key has no glyph', () => {
        const unknown: ItemDefinition = {
            itemType: '9999', key: 'not_drawn_yet', category: 'material', rarity: 2,
            name: 'Unknown', description: 'No glyph for this one.',
        };
        expect(renderItemSvg(unknown)).toContain('</svg>');
    });

    // Two documents can end up in one DOM (a sprite sheet, an inlining build step). Shared
    // ids would make the second item borrow the first one's gradient and clip path.
    it('scopes its element ids per item', () => {
        const a = renderItemSvg(ITEM_CATALOG.find((i) => i.key === 'xp_potion_i')!);
        const b = renderItemSvg(ITEM_CATALOG.find((i) => i.key === 'xp_potion_ii')!);
        const ids = (svg: string) => [...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]!);
        const shared = ids(a).filter((id) => ids(b).includes(id));
        expect(shared, `ids present in both documents: ${shared.join(', ')}`).toEqual([]);
    });

    it('escapes text that would otherwise break the document', () => {
        const nasty: ItemDefinition = {
            itemType: '9998', key: 'iron_fang', category: 'material', rarity: 1,
            name: 'A & B <script>', description: 'He said "no" & left.',
        };
        const svg = renderItemSvg(nasty);
        expect(svg).toContain('<title>A &amp; B &lt;script&gt;</title>');
        expect(svg).not.toContain('<script>');
        expect(svg).toContain('&quot;no&quot;');
    });

    // Rarity has to mean the same thing on an item as on a pet; §4 asked for one vocabulary.
    it('tints by rarity using the same palette as pets', () => {
        const legendary = ITEM_CATALOG.find((i) => i.rarity === 5)!;
        const common = ITEM_CATALOG.find((i) => i.rarity === 1)!;
        expect(renderItemSvg(legendary)).toContain('#8A2BE2');
        expect(renderItemSvg(common)).toContain('#8B4513');
    });

    it('names the item for a screen reader', () => {
        const svg = renderItemSvg(ITEM_CATALOG.find((i) => i.key === 'sunder_maul')!);
        expect(svg).toContain('role="img"');
        expect(svg).toContain('aria-label="Sunder Maul — Legendary Weapon"');
    });
});
