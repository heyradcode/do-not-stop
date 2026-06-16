import { describe, expect, it } from 'vitest';

import {
    getGeneration,
    getLifePercent,
    getPetAvatar,
    getPetClass,
    getPetElement,
    getPetProperties,
    getPropertyEmoji,
    getXpNumbers,
    getXpPercent,
} from '../../../src/utils/ethereum/petCard';

describe('getPetElement', () => {
    it('maps dna modulo the element count', () => {
        expect(getPetElement(0n)).toBe('fire');
        expect(getPetElement(1n)).toBe('water');
        expect(getPetElement(5n)).toBe('cosmic');
        expect(getPetElement(6n)).toBe('fire'); // wraps
    });
});

describe('getPetAvatar', () => {
    it('maps dna modulo the avatar count', () => {
        expect(getPetAvatar(0n)).toBe('🦊');
        expect(getPetAvatar(1n)).toBe('🐉');
        expect(getPetAvatar(6n)).toBe('🦊');
    });
});

describe('getPetClass', () => {
    it('maps dna modulo the class list', () => {
        expect(getPetClass(0n)).toBe('Fire Fox');
        expect(getPetClass(2n)).toBe('Electric Cat');
    });
});

describe('getGeneration', () => {
    it('is dna modulo three, one-indexed', () => {
        expect(getGeneration(0n)).toBe(1);
        expect(getGeneration(1n)).toBe(2);
        expect(getGeneration(2n)).toBe(3);
        expect(getGeneration(3n)).toBe(1);
    });
});

describe('getXpPercent', () => {
    it('combines level, wins and rarity, clamped to 0–100', () => {
        expect(getXpPercent({ level: 0, winCount: 0, rarity: 0, dna: 0n })).toBe(0);
        expect(getXpPercent({ level: 1, winCount: 0, rarity: 0, dna: 0n })).toBe(12);
        // 8*12 + 0 + 0 = 96, 96 % 101 = 96
        expect(getXpPercent({ level: 8, winCount: 0, rarity: 0, dna: 0n })).toBe(96);
    });
});

describe('getXpNumbers', () => {
    it('derives xpMax from level with a floor of 300', () => {
        expect(getXpNumbers({ level: 0, winCount: 0, rarity: 0, dna: 0n })).toEqual({
            xpCurrent: 0,
            xpMax: 400,
        });
    });

    it('scales xpCurrent by the xp percent', () => {
        const { xpMax, xpCurrent } = getXpNumbers({ level: 1, winCount: 0, rarity: 0, dna: 0n });
        expect(xpMax).toBe(480); // max(300, 1*80 + 400)
        expect(xpCurrent).toBe(Math.floor((12 / 100) * 480));
    });
});

describe('getPetProperties', () => {
    it('derives deterministic base stats from dna', () => {
        expect(getPetProperties({ dna: 10000n })).toEqual({
            life: 60,
            attack: 25,
            defense: 20,
            intelligence: 20,
        });
    });
});

describe('getPropertyEmoji', () => {
    it('maps known keys and falls back to sparkles', () => {
        expect(getPropertyEmoji('life')).toBe('❤️');
        expect(getPropertyEmoji('attack')).toBe('⚔️');
        expect(getPropertyEmoji('unknown')).toBe('✨');
    });
});

describe('getLifePercent', () => {
    it('returns 0 with no pet', () => {
        expect(getLifePercent(undefined)).toBe(0);
    });

    it('computes from level/wins/losses, clamped to 10–100', () => {
        expect(getLifePercent({ level: 0, winCount: 0, lossCount: 0 })).toBe(50);
        expect(getLifePercent({ level: 100, winCount: 100, lossCount: 0 })).toBe(100); // capped
        expect(getLifePercent({ level: 0, winCount: 0, lossCount: 100 })).toBe(10); // floored
    });
});
