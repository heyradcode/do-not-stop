import { describe, expect, it } from 'vitest';

import { itemArtUrl, itemFallbackArtUrl } from '../../../src/utils/items/itemArtUrl';

describe('itemArtUrl', () => {
    it('addresses an item by token id, with no chain segment', () => {
        expect(itemArtUrl('100', 'https://art.example.com')).toBe('https://art.example.com/items/100.png');
    });

    it('tolerates a trailing slash on the service URL', () => {
        expect(itemArtUrl('1', 'https://art.example.com/')).toBe('https://art.example.com/items/1.png');
        expect(itemArtUrl('1', 'https://art.example.com///')).toBe('https://art.example.com/items/1.png');
    });

    // Art is optional by construction: unset the variable and the app keeps working without
    // pictures, which is the same contract pet art has.
    it('returns null when no service is configured', () => {
        expect(itemArtUrl('1', undefined)).toBeNull();
        expect(itemArtUrl('1', '')).toBeNull();
    });
});

describe('itemFallbackArtUrl', () => {
    it('points at the deterministic SVG', () => {
        expect(itemFallbackArtUrl('300', 'https://art.example.com')).toBe('https://art.example.com/items/300.svg');
    });

    it('returns null when no service is configured', () => {
        expect(itemFallbackArtUrl('300', undefined)).toBeNull();
    });

    // The two must address the same item, or a fallback would quietly show a different one.
    it('differs from the painted URL only by extension', () => {
        const painted = itemArtUrl('21', 'https://art.example.com')!;
        const drawn = itemFallbackArtUrl('21', 'https://art.example.com')!;
        expect(painted.replace(/\.png$/, '')).toBe(drawn.replace(/\.svg$/, ''));
    });
});
