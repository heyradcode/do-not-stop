import { describe, it, expect } from 'vitest';
import { buildPetPrompt, seedFromDna, summarisePet } from './prompt.js';
import { derivePetVisualTraits } from './traits.js';

const DNA = 79_34_05_61_88_13_42_07n;

describe('buildPetPrompt', () => {
    it('is stable for a given pet', () => {
        const traits = derivePetVisualTraits({ dna: DNA, rarity: 3 });
        expect(buildPetPrompt(traits, DNA)).toEqual(buildPetPrompt(traits, DNA));
    });

    it('renders every trait into the prompt', () => {
        const { prompt } = buildPetPrompt(derivePetVisualTraits({ dna: DNA, rarity: 3 }), DNA);

        expect(prompt).toContain('slender fox-like creature'); // body 2, Sleek
        expect(prompt).toContain('dappled gradient coat'); // pattern 4
        expect(prompt).toContain('blazing eyes'); // eyes 3
        expect(prompt).toContain('blush patches on the cheeks'); // marking 3
        expect(prompt).toContain('water elemental creature'); // element 1
        expect(prompt).toContain('soft glowing aura'); // aura 2, Rare
        expect(prompt).toContain('sturdy frame'); // build 42
        expect(prompt).toContain('blazing eyes with an intense inner glow'); // eyes 3 + spark 61
        expect(prompt).toContain('cute chibi collectible creature character'); // shared style
    });

    it('forbids in the negative prompt what the style promises', () => {
        const { negativePrompt } = buildPetPrompt(derivePetVisualTraits({ dna: DNA, rarity: 1 }), DNA);

        expect(negativePrompt).toContain('text');
        expect(negativePrompt).toContain('multiple creatures');
        expect(negativePrompt).toContain('photorealistic');
    });

    it('gives different pets different prompts', () => {
        const a = buildPetPrompt(derivePetVisualTraits({ dna: DNA, rarity: 3 }), DNA);
        const other = 12_11_05_61_88_13_42_09n;
        const b = buildPetPrompt(derivePetVisualTraits({ dna: other, rarity: 5 }), other);

        expect(b.prompt).not.toBe(a.prompt);
        expect(b.seed).not.toBe(a.seed);
    });

    it('varies the prompt across every trait axis independently', () => {
        const base = derivePetVisualTraits({ dna: DNA, rarity: 3 });
        const axes = ['element', 'body', 'pattern', 'eyes', 'marking', 'aura'] as const;

        for (const axis of axes) {
            const shifted = { ...base, [axis]: base[axis] === 0 ? 1 : 0 };
            expect(buildPetPrompt(shifted, DNA).prompt).not.toBe(buildPetPrompt(base, DNA).prompt);
        }
    });
});

describe('seedFromDna', () => {
    it('folds 16-digit DNA into a non-negative int32 seed', () => {
        for (const dna of [0n, 1n, DNA, 9_999_999_999_999_999n]) {
            const seed = seedFromDna(dna);
            expect(Number.isInteger(seed)).toBe(true);
            expect(seed).toBeGreaterThanOrEqual(0);
            expect(seed).toBeLessThan(2_147_483_647);
        }
    });

    it('is a pure function of DNA', () => {
        expect(seedFromDna(DNA)).toBe(seedFromDna(DNA));
    });
});

describe('summarisePet', () => {
    it('summarises a pet in one sentence', () => {
        expect(summarisePet(derivePetVisualTraits({ dna: DNA, rarity: 3 }))).toBe(
            'Rare Water Sleek with dappled gradient coat, blazing eyes, and a cheeks marking.',
        );
    });

    it('says "no markings" rather than naming the None marking', () => {
        const traits = { ...derivePetVisualTraits({ dna: DNA, rarity: 1 }), marking: 0 };
        expect(summarisePet(traits)).toContain('no markings');
    });
});
