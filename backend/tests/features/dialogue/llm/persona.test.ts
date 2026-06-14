import { describe, it, expect } from 'vitest';
import { buildPersona, renderPersona } from '../../../../src/features/dialogue/llm/persona';
import type { PetPersonaInput } from '../../../../src/features/dialogue/dialogue.types';

const pet = (overrides: Partial<PetPersonaInput> = {}): PetPersonaInput => ({
    petId: 'pet-1',
    name: 'Whatever',
    level: 1,
    rarity: 1,
    dna: '0',
    winCount: 0,
    lossCount: 0,
    ...overrides,
});

describe('buildPersona', () => {
    it('maps dna % 6 to element and class in lockstep', () => {
        expect(buildPersona(pet({ dna: '0' }))).toMatchObject({ element: 'fire', petClass: 'Fire Fox' });
        expect(buildPersona(pet({ dna: '1' }))).toMatchObject({ element: 'water', petClass: 'Water Dragon' });
        expect(buildPersona(pet({ dna: '2' }))).toMatchObject({ element: 'electric', petClass: 'Electric Cat' });
        expect(buildPersona(pet({ dna: '3' }))).toMatchObject({ element: 'nature', petClass: 'Nature Beast' });
        expect(buildPersona(pet({ dna: '4' }))).toMatchObject({ element: 'shadow', petClass: 'Shadow Hound' });
        expect(buildPersona(pet({ dna: '5' }))).toMatchObject({ element: 'cosmic', petClass: 'Cosmic Owl' });
        // wraps around
        expect(buildPersona(pet({ dna: '6' }))).toMatchObject({ element: 'fire', petClass: 'Fire Fox' });
    });

    it('falls back to fire/index 0 when dna is not a valid bigint', () => {
        expect(buildPersona(pet({ dna: 'not-a-number' }))).toMatchObject({
            element: 'fire',
            petClass: 'Fire Fox',
        });
    });

    it('maps rarity to a name, defaulting to Unknown', () => {
        expect(buildPersona(pet({ rarity: 5 })).rarity).toBe('Legendary');
        expect(buildPersona(pet({ rarity: 1 })).rarity).toBe('Common');
        expect(buildPersona(pet({ rarity: 99 })).rarity).toBe('Unknown');
    });

    it('formats the win/loss record and carries petId + level', () => {
        const p = buildPersona(pet({ petId: 'xyz', level: 4, winCount: 3, lossCount: 1 }));
        expect(p.petId).toBe('xyz');
        expect(p.level).toBe(4);
        expect(p.record).toBe('3W/1L');
    });

    describe('temperament', () => {
        it('describes an untested rookie', () => {
            const t = buildPersona(pet({ level: 1, winCount: 0, lossCount: 0 })).temperament;
            expect(t).toContain('untested but eager to prove itself');
            expect(t).toContain('rookie');
        });

        it('describes a supremely confident veteran', () => {
            const t = buildPersona(pet({ level: 9, winCount: 10, lossCount: 1 })).temperament;
            expect(t).toContain('supremely confident');
            expect(t).toContain('veteran');
        });

        it('describes an underdog seasoned fighter', () => {
            const t = buildPersona(pet({ level: 5, winCount: 1, lossCount: 5 })).temperament;
            expect(t).toContain('an underdog with a chip on its shoulder');
            expect(t).toContain('seasoned fighter');
        });

        it('uses the element tone prefix', () => {
            const t = buildPersona(pet({ dna: '0' })).temperament; // fire
            expect(t.startsWith('hot-headed and aggressive')).toBe(true);
        });
    });
});

describe('renderPersona', () => {
    it('renders a compact fragment and never includes the pet name', () => {
        const p = buildPersona(pet({ name: 'SECRET_NAME', dna: '1', rarity: 3, level: 2, winCount: 5, lossCount: 2 }));
        const rendered = renderPersona(p);
        expect(rendered).toBe(
            'water Water Dragon, Rare, level 2, record 5W/2L. cool, flowing, and sly; supremely confident rookie.',
        );
        expect(rendered).not.toContain('SECRET_NAME');
    });
});
