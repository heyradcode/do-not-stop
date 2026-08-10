import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config/env', () => ({
    env: { battle: { deploymentId: 'base-sepolia-live', chainIds: ['eip155:84532'] } },
}));

// Equipment resolution has its own coverage; stubbed to ungeared so these stay about
// merging the roster with progression.
vi.mock('@features/inventory', () => ({
    getPetEquipmentForCombat: vi.fn(async () => []),
    // Real, because the builder is expected to let it through untouched and a stub class
    // would make `rejects.toThrow(ItemCatalogError)` pass against any error at all.
    ItemCatalogError: class ItemCatalogError extends Error {},
}));

vi.mock('@config/prisma', () => ({
    prisma: {
        petRoster: { findUnique: vi.fn() },
        petBattleProgress: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    },
}));

import { prisma } from '@config/prisma';
import { buildPetSnapshot } from '@features/battle/ledger';
import { getPetEquipmentForCombat, ItemCatalogError } from '@features/inventory';

const ROSTER_ROW = {
    chain: 'evm',
    petId: '1',
    owner: '0xabcdef0123456789abcdef0123456789abcdef01',
    level: 40,
    rarity: 3,
    dna: '1234567890123456',
    winCount: 12,
    lossCount: 3,
    speciesId: 12, // 12 % 8 = 4
    lastVersion: 999888n,
};

beforeEach(() => {
    vi.clearAllMocks();
});

describe('a pet the roster does not have', () => {
    it('returns null rather than throwing', async () => {
        vi.mocked(prisma.petRoster.findUnique).mockResolvedValue(null);
        expect(await buildPetSnapshot('eip155:84532', '999')).toBeNull();
        expect(prisma.petBattleProgress.findUnique).not.toHaveBeenCalled();
    });
});

describe('merging roster and progress', () => {
    it('derives skill from speciesId % 8', async () => {
        vi.mocked(prisma.petRoster.findUnique).mockResolvedValue(ROSTER_ROW as never);
        vi.mocked(prisma.petBattleProgress.findUnique).mockResolvedValue({
            level: 40,
            xp: 500,
            lastOpponentId: '7',
            streak: 2,
            readyAt: 1000n,
        } as never);

        const snapshot = await buildPetSnapshot('eip155:84532', '1');

        expect(snapshot).toEqual({
            petId: 1n,
            owner: ROSTER_ROW.owner,
            dna: 1234567890123456n,
            rarity: 3,
            level: 40,
            skill: 4,
            xp: 500,
            lastOpponentId: 7n,
            streak: 2,
            readyAt: 1000,
            sourceVersion: 999888n,
        });
    });

    it('queries pet_roster by chain family, not the full protocol chain id', async () => {
        // pet_roster is keyed by 'evm' | 'solana'; passing the specific chain id straight
        // through would silently match nothing.
        vi.mocked(prisma.petRoster.findUnique).mockResolvedValue(ROSTER_ROW as never);
        vi.mocked(prisma.petBattleProgress.findUnique).mockResolvedValue({
            level: 40,
            xp: 0,
            lastOpponentId: '0',
            streak: 0,
            readyAt: 0n,
        } as never);

        await buildPetSnapshot('eip155:84532', '1');

        expect(prisma.petRoster.findUnique).toHaveBeenCalledWith({
            where: { chain_petId: { chain: 'evm', petId: '1' } },
        });
    });

    it('keys progress by the specific protocol chain id and this deployment', async () => {
        // One deployment can serve more than one chain of the same family, so the family alone
        // would not disambiguate their pet-id namespaces.
        vi.mocked(prisma.petRoster.findUnique).mockResolvedValue(ROSTER_ROW as never);
        vi.mocked(prisma.petBattleProgress.findUnique).mockResolvedValue({
            level: 40,
            xp: 0,
            lastOpponentId: '0',
            streak: 0,
            readyAt: 0n,
        } as never);

        await buildPetSnapshot('eip155:84532', '1');

        expect(prisma.petBattleProgress.findUnique).toHaveBeenCalledWith({
            where: {
                chainId_deploymentId_petId: {
                    chainId: 'eip155:84532',
                    deploymentId: 'base-sepolia-live',
                    petId: '1',
                },
            },
        });
    });
});

describe('paid on-chain upgrades after the first battle', () => {
    it('adopts a higher on-chain level into the row before fighting', async () => {
        // The row was seeded at first battle, then the owner paid train()/levelUp() on
        // chain. The snapshot must carry the bought level — and persist it, because the
        // receipt's progression replays from the signed snapshot.
        vi.mocked(prisma.petRoster.findUnique).mockResolvedValue(ROSTER_ROW as never); // level 40
        vi.mocked(prisma.petBattleProgress.findUnique).mockResolvedValue({
            level: 5,
            xp: 80,
            lastOpponentId: '7',
            streak: 1,
            readyAt: 0n,
        } as never);
        vi.mocked(prisma.petBattleProgress.update).mockResolvedValue({
            level: 40,
            xp: 80,
            lastOpponentId: '7',
            streak: 1,
            readyAt: 0n,
        } as never);

        const snapshot = await buildPetSnapshot('eip155:84532', '1');

        expect(prisma.petBattleProgress.update).toHaveBeenCalledWith({
            where: expect.anything(),
            data: { level: 40 },
        });
        expect(snapshot!.level).toBe(40);
        // Backend xp and streak survive the adoption; only the level moves.
        expect(snapshot!.xp).toBe(80);
        expect(snapshot!.streak).toBe(1);
    });

    it('leaves the row alone when backend battles are already ahead of the chain', async () => {
        vi.mocked(prisma.petRoster.findUnique).mockResolvedValue(ROSTER_ROW as never); // level 40
        vi.mocked(prisma.petBattleProgress.findUnique).mockResolvedValue({
            level: 45,
            xp: 10,
            lastOpponentId: '0',
            streak: 0,
            readyAt: 0n,
        } as never);

        const snapshot = await buildPetSnapshot('eip155:84532', '1');

        expect(prisma.petBattleProgress.update).not.toHaveBeenCalled();
        expect(snapshot!.level).toBe(45);
    });
});

describe('first backend battle for a pet', () => {
    it('seeds progress from on-chain level, zeroes XP, and starts with no opponent history', async () => {
        // A level-40 pet's first backend battle starts at level 40, not level 1. XP starts a
        // fresh cycle rather than inheriting a partial on-chain counter under a different
        // formula.
        vi.mocked(prisma.petRoster.findUnique).mockResolvedValue(ROSTER_ROW as never);
        vi.mocked(prisma.petBattleProgress.findUnique).mockResolvedValue(null);
        vi.mocked(prisma.petBattleProgress.create).mockResolvedValue({
            level: 40,
            xp: 0,
            lastOpponentId: '0',
            streak: 0,
            readyAt: 0n,
        } as never);

        const snapshot = await buildPetSnapshot('eip155:84532', '1');

        expect(prisma.petBattleProgress.create).toHaveBeenCalledWith({
            data: {
                chainId: 'eip155:84532',
                deploymentId: 'base-sepolia-live',
                petId: '1',
                level: 40,
                xp: 0,
                winCount: 12,
                lossCount: 3,
            },
        });
        expect(snapshot!.level).toBe(40);
        expect(snapshot!.xp).toBe(0);
        expect(snapshot!.lastOpponentId).toBe(0n);
        expect(snapshot!.streak).toBe(0);
    });

    it('re-reads rather than erroring when two first battles race to create the row', async () => {
        vi.mocked(prisma.petRoster.findUnique).mockResolvedValue(ROSTER_ROW as never);
        vi.mocked(prisma.petBattleProgress.findUnique)
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ level: 40, xp: 0, lastOpponentId: '0', streak: 0, readyAt: 0n } as never);
        vi.mocked(prisma.petBattleProgress.create).mockRejectedValue(
            Object.assign(new Error('unique'), { code: 'P2002' }),
        );

        const snapshot = await buildPetSnapshot('eip155:84532', '1');

        // Safe because the initial values are a pure function of on-chain state, not of
        // anything the losing caller would have computed differently.
        expect(snapshot!.level).toBe(40);
        expect(prisma.petBattleProgress.findUnique).toHaveBeenCalledTimes(2);
    });

    it('rethrows an unexpected error rather than treating it as a lost race', async () => {
        vi.mocked(prisma.petRoster.findUnique).mockResolvedValue(ROSTER_ROW as never);
        vi.mocked(prisma.petBattleProgress.findUnique).mockResolvedValue(null);
        vi.mocked(prisma.petBattleProgress.create).mockRejectedValue(new Error('connection reset'));

        await expect(buildPetSnapshot('eip155:84532', '1')).rejects.toThrow(/connection reset/);
    });
});

describe('freezing equipment (roadmap §4)', () => {
    // Its own setup: vi.clearAllMocks resets call records but not implementations, so an
    // earlier case's rejecting create would otherwise carry into these.
    beforeEach(() => {
        vi.mocked(prisma.petRoster.findUnique).mockResolvedValue(ROSTER_ROW as never);
        vi.mocked(prisma.petBattleProgress.findUnique).mockResolvedValue({
            level: 40, xp: 0, lastOpponentId: '0', streak: 0, readyAt: 0n,
        } as never);
    });

    // Already narrowed to the modifier by `getPetEquipmentForCombat`, which is also where
    // an uncatalogued or unreadable item is refused outright. That refusal is covered in
    // `inventory.service.test.ts`; by the time the builder sees a row it is priceable.
    const BLADE = {
        slot: 0,
        itemType: '1',
        key: 'iron_fang',
        bonus: { kind: 'stat_bonus' as const, hp: 0, atk: 4, def: 0, int: 0, mdef: 0 },
    };
    const PLATE = {
        slot: 1,
        itemType: '11',
        key: 'scale_mail',
        bonus: { kind: 'stat_bonus' as const, hp: 30, atk: 0, def: 10, int: 0, mdef: 0 },
    };

    // Resolved, not referenced: unequipping after acceptance must not change a committed
    // fight, exactly as a level-up between acceptance and settlement must not.
    it('freezes the resolved modifiers alongside the item type', async () => {
        vi.mocked(getPetEquipmentForCombat).mockResolvedValue([BLADE] as never);

        const snapshot = await buildPetSnapshot('eip155:84532', '1');

        expect(snapshot!.equipment).toEqual([
            { slot: 0, itemType: 1n, hp: 0, atk: 4, def: 0, int: 0, mdef: 0 },
        ]);
    });

    // Slot order is part of the snapshot digest, and assertPetSnapshot refuses to sort
    // silently, so the builder has to hand it over already ordered.
    it('orders slots ascending whatever order the rows arrive in', async () => {
        vi.mocked(getPetEquipmentForCombat).mockResolvedValue([PLATE, BLADE] as never);

        const snapshot = await buildPetSnapshot('eip155:84532', '1');

        expect(snapshot!.equipment?.map((e) => e.slot)).toEqual([0, 1]);
    });

    // Propagated, not caught: acceptance turns this into an `item-catalog-stale` rejection,
    // and a snapshot builder that swallowed it would hand back a pet fighting bare while
    // chain state says otherwise.
    it('lets a catalog failure reach the caller', async () => {
        vi.mocked(getPetEquipmentForCombat).mockRejectedValue(new ItemCatalogError('uncatalogued item type 99'));

        await expect(buildPetSnapshot('eip155:84532', '1')).rejects.toThrow(ItemCatalogError);
    });

    // Omitted rather than empty, so an ungeared snapshot's stored JSON is identical to what
    // it was before equipment existed.
    it('omits the field entirely for an ungeared pet', async () => {
        vi.mocked(getPetEquipmentForCombat).mockResolvedValue([] as never);

        expect((await buildPetSnapshot('eip155:84532', '1'))!.equipment).toBeUndefined();
    });
});
