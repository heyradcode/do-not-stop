import { prisma } from '@config/prisma';

/**
 * Queries over the inventory tables (roadmap §4).
 *
 * Three tables with two owners, and the queries keep that split visible: `item_definition`
 * is backend content, while `item_roster` and `pet_equipment` are projections indexer-go
 * writes. Nothing here writes to either projection, because a second writer would defeat
 * the version guard that makes them idempotent.
 */

export interface ItemDefinitionRow {
    itemType: string;
    key: string;
    category: string;
    slot: number | null;
    rarity: number;
    effect: unknown;
    name: string;
    description: string;
}

export interface ItemBalanceRow {
    itemType: string;
    quantity: bigint;
}

export interface EquipmentSlotRow {
    slot: number;
    itemType: string;
}

/** The whole catalog, ordered by token id so a page reads in the banded order it was authored in. */
export function findAllDefinitions(): Promise<ItemDefinitionRow[]> {
    return prisma.itemDefinition.findMany({ orderBy: { itemType: 'asc' } });
}

export function findDefinitions(itemTypes: string[]): Promise<ItemDefinitionRow[]> {
    if (itemTypes.length === 0) {
        return Promise.resolve([]);
    }
    return prisma.itemDefinition.findMany({ where: { itemType: { in: itemTypes } } });
}

export function findDefinitionByType(itemType: string): Promise<ItemDefinitionRow | null> {
    return prisma.itemDefinition.findUnique({ where: { itemType } });
}

/**
 * One wallet's balances.
 *
 * Zero-quantity rows are filtered out here rather than deleted upstream. The projection
 * has to keep them (a deletion is invisible to the watermark read that produced it), so
 * "spent to nothing" is a value in the table and an absence in the API.
 */
export function findBalances(chain: string, owner: string): Promise<ItemBalanceRow[]> {
    return prisma.itemRoster.findMany({
        where: { chain, owner, quantity: { gt: 0 } },
        select: { itemType: true, quantity: true },
        orderBy: { itemType: 'asc' },
    });
}

export function findBalance(chain: string, owner: string, itemType: string): Promise<ItemBalanceRow | null> {
    return prisma.itemRoster.findUnique({
        where: { chain_owner_itemType: { chain, owner, itemType } },
        select: { itemType: true, quantity: true },
    });
}

export interface EntitlementRow {
    id: string;
    itemType: string;
    quantity: number;
    source: string;
    sourceRef: string;
    createdAt: Date;
}

/**
 * A wallet's unclaimed entitlements, newest first.
 *
 * Unclaimed only. A claimed one is just an item in the bag by then, and listing both would
 * make the same drop appear twice on a screen whose whole job is "here is what is waiting".
 */
export function findUnclaimedEntitlements(chain: string, owner: string): Promise<EntitlementRow[]> {
    return prisma.itemEntitlement.findMany({
        where: { chain, owner, claimedAt: null },
        select: { id: true, itemType: true, quantity: true, source: true, sourceRef: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
    });
}

/** One pet's filled slots. Item type "0" means empty, so those are dropped. */
export function findEquipment(chain: string, petId: string): Promise<EquipmentSlotRow[]> {
    return prisma.petEquipment.findMany({
        where: { chain, petId, itemType: { not: '0' } },
        select: { slot: true, itemType: true },
        orderBy: { slot: 'asc' },
    });
}
