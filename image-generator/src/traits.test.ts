import { describe, it, expect } from 'vitest';
import {
    BODY_NAMES,
    EYE_NAMES,
    MARKING_NAMES,
    PATTERN_NAMES,
    derivePetVisualTraits,
    describePetVisualTraits,
    digitPair,
} from './traits.js';

// 16-digit DNA, LSB-first digit pairs: pair0=07 element/rarity, pair1=42 hp,
// pair2=13 atk, pair3=88 def, pair4=61 int, pair5=05 mdef, pair6=34 species,
// pair7=79 cosmetic.
const DNA = 79_34_05_61_88_13_42_07n;

describe('digitPair', () => {
    it('slices two-digit pairs LSB-first, matching DnaLib', () => {
        expect(digitPair(DNA, 0)).toBe(7n);
        expect(digitPair(DNA, 4)).toBe(61n);
        expect(digitPair(DNA, 7)).toBe(79n);
        expect(digitPair(0n, 3)).toBe(0n);
    });
});

describe('derivePetVisualTraits', () => {
    it('reads each trait from its own digit pair', () => {
        const traits = derivePetVisualTraits({ dna: DNA, rarity: 3 });

        expect(traits.element).toBe(1); // pair0 07 % 6
        expect(traits.body).toBe(2); // pair6 34 % 8, no speciesId
        expect(traits.pattern).toBe(4); // pair7 79 % 5
        expect(traits.eyes).toBe(3); // floor(79 / 5) % 4 = 15 % 4
        expect(traits.marking).toBe(3); // floor(79 / 20) % 5
        expect(traits.aura).toBe(2); // rarity 3 - 1
        expect(traits.build).toBe(42); // hp gene
        expect(traits.spark).toBe(61); // int gene
    });

    it('prefers the stored speciesId over DNA pair 6 for the body', () => {
        expect(derivePetVisualTraits({ dna: DNA, rarity: 1, speciesId: 5 }).body).toBe(5);
        expect(derivePetVisualTraits({ dna: DNA, rarity: 1, speciesId: 11 }).body).toBe(3); // 11 % 8
    });

    it('clamps rarity outside 1-5 instead of producing a negative aura', () => {
        expect(derivePetVisualTraits({ dna: DNA, rarity: 0 }).aura).toBe(0);
        expect(derivePetVisualTraits({ dna: DNA, rarity: 9 }).aura).toBe(4);
    });

    it('is deterministic and keeps every index inside its table', () => {
        for (let i = 0; i < 100; i++) {
            const dna = (BigInt(i) * 1_234_567_891_234_567n) % 10_000_000_000_000_000n;
            const rarity = (i % 5) + 1;
            const traits = derivePetVisualTraits({ dna, rarity });

            expect(derivePetVisualTraits({ dna, rarity })).toEqual(traits);
            expect(traits.body).toBeLessThan(BODY_NAMES.length);
            expect(traits.pattern).toBeLessThan(PATTERN_NAMES.length);
            expect(traits.eyes).toBeLessThan(EYE_NAMES.length);
            expect(traits.marking).toBeLessThan(MARKING_NAMES.length);
            expect(traits.element).toBeLessThan(6);
            expect(traits.aura).toBeLessThan(5);
        }
    });

    it('spreads cosmetic pair 7 over all 100 pattern/eye/marking combinations', () => {
        const seen = new Set<string>();
        for (let cosmetic = 0; cosmetic < 100; cosmetic++) {
            const t = derivePetVisualTraits({ dna: BigInt(cosmetic) * 100_000_000_000_000n, rarity: 1 });
            seen.add(`${t.pattern}-${t.eyes}-${t.marking}`);
        }
        expect(seen.size).toBe(100);
    });
});

describe('describePetVisualTraits', () => {
    it('labels traits in metadata attribute order', () => {
        const labels = describePetVisualTraits(derivePetVisualTraits({ dna: DNA, rarity: 3 }));

        expect(labels.map((l) => l.trait)).toEqual([
            'Element',
            'Body',
            'Pattern',
            'Eyes',
            'Marking',
            'Rarity',
        ]);
        expect(labels[0]!.value).toBe('Water');
        expect(labels[4]!.value).toBe('Cheeks');
        expect(labels[5]!.value).toBe('Rare');
    });
});
