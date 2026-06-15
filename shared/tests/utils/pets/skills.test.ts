import { describe, it, expect } from 'vitest';
import { getPetSkill } from '../../../src/utils/pets/skills';

describe('getPetSkill', () => {
    it('returns null when speciesId is undefined', () => {
        expect(getPetSkill(undefined)).toBeNull();
    });

    it('maps speciesId % 8 to the canonical archetype', () => {
        expect(getPetSkill(0)?.name).toBe('Tank');
        expect(getPetSkill(1)?.name).toBe('Shell');
        expect(getPetSkill(6)?.name).toBe('Rebirth');
        expect(getPetSkill(7)?.name).toBe('Bloodlust');
    });

    it('wraps past 8 (skill = speciesId % 8)', () => {
        expect(getPetSkill(8)?.index).toBe(0);
        expect(getPetSkill(8)?.name).toBe('Tank');
        expect(getPetSkill(15)?.name).toBe('Bloodlust'); // 15 % 8 = 7
        expect(getPetSkill(20)?.name).toBe('Fury'); // 20 % 8 = 4
    });

    it('every archetype carries a description', () => {
        for (let id = 0; id < 8; id++) {
            expect(getPetSkill(id)?.description).toBeTruthy();
        }
    });
});
