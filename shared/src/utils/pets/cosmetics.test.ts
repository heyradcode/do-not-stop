import { describe, it, expect, vi, afterEach } from 'vitest';
import { getRarityColor, getRarityName, isPetReadyAt } from './cosmetics';

describe('getRarityColor', () => {
    it('maps known rarities to their colors', () => {
        expect(getRarityColor(1)).toBe('#8B4513');
        expect(getRarityColor(2)).toBe('#C0C0C0');
        expect(getRarityColor(3)).toBe('#FFD700');
        expect(getRarityColor(4)).toBe('#FF69B4');
        expect(getRarityColor(5)).toBe('#8A2BE2');
    });

    it('falls back to the common color for unknown rarities', () => {
        expect(getRarityColor(0)).toBe('#8B4513');
        expect(getRarityColor(99)).toBe('#8B4513');
        expect(getRarityColor(-1)).toBe('#8B4513');
    });
});

describe('getRarityName', () => {
    it('maps known rarities to their names', () => {
        expect(getRarityName(1)).toBe('Common');
        expect(getRarityName(2)).toBe('Uncommon');
        expect(getRarityName(3)).toBe('Rare');
        expect(getRarityName(4)).toBe('Epic');
        expect(getRarityName(5)).toBe('Legendary');
    });

    it('returns "Unknown" for unmapped rarities', () => {
        expect(getRarityName(0)).toBe('Unknown');
        expect(getRarityName(6)).toBe('Unknown');
    });
});

describe('isPetReadyAt', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns true when readyAt (unix seconds) is in the past', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
        const nowSeconds = Date.now() / 1000;
        expect(isPetReadyAt(nowSeconds - 10)).toBe(true);
    });

    it('returns true exactly at the ready time', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
        const nowSeconds = Date.now() / 1000;
        expect(isPetReadyAt(nowSeconds)).toBe(true);
    });

    it('returns false when readyAt is in the future', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
        const nowSeconds = Date.now() / 1000;
        expect(isPetReadyAt(nowSeconds + 3600)).toBe(false);
    });
});
