import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_DROP_RATES, recordBattleDrops, rollDrops } from '@features/inventory/drops';
import { ITEM_CATALOG } from '@features/inventory/catalog.data';

const SEED = `0x${'ab'.repeat(32)}` as const;
const WINNER = '0xaaa0000000000000000000000000000000000001';
const LOSER = '0xbbb0000000000000000000000000000000000002';

const ALWAYS = { winnerChanceBps: 10_000, loserChanceBps: 10_000 };
const NEVER = { winnerChanceBps: 0, loserChanceBps: 0 };

describe('rollDrops', () => {
    // The whole point of seeding from the battle's drand seed: the seed is committed to a
    // future round before the fight resolves, so a drop cannot be re-rolled by anyone,
    // including this server, and anyone holding the receipt can recompute it.
    it('is deterministic in the seed and the battle id', () => {
        const a = rollDrops(SEED, 'battle-1', WINNER, LOSER, ALWAYS);
        const b = rollDrops(SEED, 'battle-1', WINNER, LOSER, ALWAYS);
        expect(a).toEqual(b);
    });

    it('gives a different answer for a different battle under the same seed', () => {
        const a = rollDrops(SEED, 'battle-1', WINNER, LOSER, ALWAYS);
        const b = rollDrops(SEED, 'battle-2', WINNER, LOSER, ALWAYS);
        expect(a).not.toEqual(b);
    });

    // Separate labelled streams per side, so one side's outcome says nothing about the
    // other's.
    it('rolls the two sides independently', () => {
        const drops = rollDrops(SEED, 'battle-1', WINNER, LOSER, ALWAYS);
        expect(drops).toHaveLength(2);
        expect(drops[0]!.owner).toBe(WINNER);
        expect(drops[1]!.owner).toBe(LOSER);
    });

    it('pays nothing at zero chance', () => {
        expect(rollDrops(SEED, 'battle-1', WINNER, LOSER, NEVER)).toEqual([]);
    });

    it('pays the loser only when the loser rate is non-zero', () => {
        const drops = rollDrops(SEED, 'battle-1', WINNER, LOSER, { winnerChanceBps: 0, loserChanceBps: 10_000 });
        expect(drops).toHaveLength(1);
        expect(drops[0]!.owner).toBe(LOSER);
    });

    // Equipment is the tier §4 gates behind its own design review; having it fall out of
    // ordinary battles would settle that question by accident.
    it('never drops equipment', () => {
        const equipment = new Set(ITEM_CATALOG.filter((i) => i.category === 'equipment').map((i) => i.itemType));

        for (let i = 0; i < 400; i++) {
            for (const drop of rollDrops(SEED, `battle-${i}`, WINNER, LOSER, ALWAYS)) {
                expect(equipment.has(drop.itemType)).toBe(false);
            }
        }
    });

    it('only ever drops items that exist in the catalog', () => {
        const known = new Set(ITEM_CATALOG.map((i) => i.itemType));

        for (let i = 0; i < 400; i++) {
            for (const drop of rollDrops(SEED, `battle-${i}`, WINNER, LOSER, ALWAYS)) {
                expect(known.has(drop.itemType)).toBe(true);
                expect(drop.quantity).toBe(1);
            }
        }
    });

    // Rarity is the weight, inverted, so a Common should land far more often than a
    // Legendary over a large sample.
    it('favours common items over rare ones', () => {
        const rarityOf = new Map(ITEM_CATALOG.map((i) => [i.itemType, i.rarity]));
        const counts = new Map<number, number>();

        for (let i = 0; i < 3000; i++) {
            for (const drop of rollDrops(SEED, `battle-${i}`, WINNER, LOSER, ALWAYS)) {
                const rarity = rarityOf.get(drop.itemType)!;
                counts.set(rarity, (counts.get(rarity) ?? 0) + 1);
            }
        }

        expect(counts.get(1) ?? 0).toBeGreaterThan(counts.get(5) ?? 0);
    });

    // The chance roll has to actually bite: a rate that never refuses would mean the high
    // half of the digest was being ignored.
    it('pays roughly at the configured rate', () => {
        let paid = 0;
        const trials = 2000;
        for (let i = 0; i < trials; i++) {
            paid += rollDrops(SEED, `battle-${i}`, WINNER, LOSER, {
                winnerChanceBps: DEFAULT_DROP_RATES.winnerChanceBps,
                loserChanceBps: 0,
            }).length;
        }

        // 25% nominal; a wide band, because this pins "the rate is applied" rather than
        // the quality of keccak as a uniform source.
        expect(paid / trials).toBeGreaterThan(0.2);
        expect(paid / trials).toBeLessThan(0.3);
    });
});

describe('recordBattleDrops', () => {
    function fakeTx() {
        return { itemEntitlement: { createMany: vi.fn().mockResolvedValue({ count: 2 }) } };
    }

    it('writes each drop as an unclaimed entitlement keyed to the battle', async () => {
        const tx = fakeTx();

        await recordBattleDrops(tx as never, {
            chain: 'evm',
            battleId: 'battle-1',
            seed: SEED,
            winnerOwner: WINNER,
            loserOwner: LOSER,
            rates: ALWAYS,
        });

        const { data, skipDuplicates } = tx.itemEntitlement.createMany.mock.calls[0]![0];
        expect(skipDuplicates).toBe(true);
        expect(data).toHaveLength(2);
        expect(data[0]).toMatchObject({ chain: 'evm', source: 'battle_drop', sourceRef: 'battle-1', owner: WINNER });
    });

    // sourceRef is the battle id and the unique key is (sourceRef, owner, itemType), so a
    // retried receipt transaction collides with its own earlier row instead of paying
    // twice. skipDuplicates is what turns that collision into a no-op.
    it('skips duplicates so a retried receipt transaction cannot pay twice', async () => {
        const tx = fakeTx();
        await recordBattleDrops(tx as never, {
            chain: 'evm', battleId: 'battle-1', seed: SEED,
            winnerOwner: WINNER, loserOwner: LOSER, rates: ALWAYS,
        });
        expect(tx.itemEntitlement.createMany.mock.calls[0]![0].skipDuplicates).toBe(true);
    });

    it('writes nothing when the battle paid nothing', async () => {
        const tx = fakeTx();
        const drops = await recordBattleDrops(tx as never, {
            chain: 'evm', battleId: 'battle-1', seed: SEED,
            winnerOwner: WINNER, loserOwner: LOSER, rates: NEVER,
        });
        expect(drops).toEqual([]);
        expect(tx.itemEntitlement.createMany).not.toHaveBeenCalled();
    });
});
