import { describe, expect, it } from 'vitest';

import { describeItemEffect, explainItem, itemStats, type ItemDefinition } from '../../src/types/item';

const item = (over: Partial<ItemDefinition>): ItemDefinition => ({
    itemType: '1',
    key: 'iron_fang',
    category: 'equipment',
    slot: 0,
    rarity: 1,
    effect: null,
    name: 'Iron Fang',
    description: 'A blunt starter blade.',
    ...over,
});

const bonus = (over: Partial<{ hp: number; atk: number; def: number; int: number; mdef: number }>) =>
    ({ kind: 'stat_bonus', hp: 0, atk: 0, def: 0, int: 0, mdef: 0, ...over }) as const;

describe('itemStats', () => {
    it('returns one entry per non-zero stat, abbreviated', () => {
        expect(itemStats(bonus({ hp: 30, def: 10 }))).toEqual([
            { label: 'HP', value: 30 },
            { label: 'DEF', value: 10 },
        ]);
    });

    // A weapon should not advertise "+0 DEF" just because the field exists.
    it('drops zero stats', () => {
        expect(itemStats(bonus({ atk: 4 }))).toEqual([{ label: 'ATK', value: 4 }]);
    });

    it('keeps the game\'s stat order rather than the order they were set', () => {
        expect(itemStats(bonus({ mdef: 8, int: 12 })).map((s) => s.label)).toEqual(['INT', 'MDEF']);
    });

    it('treats granted XP as a stat, since it is the number that matters', () => {
        expect(itemStats({ kind: 'grant_xp', amount: 50 })).toEqual([{ label: 'XP', value: 50 }]);
    });

    // A real effect with no number. Inventing one to fill the chip row would be worse than
    // the empty row; the sentence behind the "?" is where it gets described.
    it('returns nothing for an effect with no number', () => {
        expect(itemStats({ kind: 'clear_battle_cooldown' })).toEqual([]);
        expect(itemStats(null)).toEqual([]);
    });

    // Structure and wording are separate questions, and a card that split the sentence would
    // be depending on a comma.
    it('is derived independently of the sentence form', () => {
        const effect = bonus({ hp: 12, def: 4 });
        expect(describeItemEffect(effect)).toBe('+12 HP, +4 DEF');
        expect(itemStats(effect)).toHaveLength(2);
    });
});

describe('explainItem', () => {
    it('says where gear goes and that the bonus lasts', () => {
        const text = explainItem(item({ effect: bonus({ atk: 4 }), slot: 0 }));
        expect(text).toContain('+4 ATK');
        expect(text).toContain('weapon slot');
        expect(text).toContain('unequip');
    });

    it('joins several bonuses readably', () => {
        expect(explainItem(item({ effect: bonus({ hp: 45, def: 16, mdef: 6 }) })))
            .toContain('+45 HP, +16 DEF and +6 MDEF');
    });

    // The question the chip cannot answer: does using this destroy it?
    it('says a consumable is burned', () => {
        expect(explainItem(item({ category: 'consumable', slot: null, effect: { kind: 'grant_xp', amount: 200 } })))
            .toContain('Consumed on use');
        expect(explainItem(item({ category: 'consumable', slot: null, effect: { kind: 'clear_battle_cooldown' } })))
            .toContain('Consumed on use');
    });

    // `effect: null` alone cannot tell these apart, which is why this takes the whole item.
    it('distinguishes a material from a collectible', () => {
        expect(explainItem(item({ category: 'material', slot: null }))).toContain('crafting');
        expect(explainItem(item({ category: 'collectible', slot: null }))).toContain('no effect in battle');
    });

    it('always answers, so the tooltip is never empty', () => {
        for (const category of ['equipment', 'consumable', 'collectible', 'material'] as const) {
            expect(explainItem(item({ category, slot: null })).length).toBeGreaterThan(20);
        }
    });
});
