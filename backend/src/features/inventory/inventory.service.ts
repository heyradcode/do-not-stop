import { normalizeAccount } from '@cryptopets/protocol';

import {
    findAllDefinitions,
    findBalances,
    findDefinitions,
    findEquipment,
    findEquipmentForPets,
    findUnclaimedEntitlements,
    type ItemDefinitionRow,
} from '@repositories/inventory.repository';

import { asItemEffect, type ItemEffect } from './catalog';

/**
 * Inventory reads (roadmap §4).
 *
 * Every read joins a projection to the catalog, because neither half is useful alone: the
 * projection knows a wallet holds three of type 100 and nothing about what that is, and
 * the catalog knows what type 100 is and nothing about who holds it. The join happens here
 * rather than in SQL so the two tables' different owners stay visible, and because the
 * catalog is small enough that fetching the rows a page needs is one indexed lookup.
 *
 * An item held but missing from the catalog is dropped rather than surfaced as an unnamed
 * row. That state means either a mint of a type nobody defined, or a catalog seeded behind
 * the contract, and both are operational faults where a blank tile in a player's bag is the
 * worst way to find out. It is logged instead.
 */

/** One catalog entry as the API presents it. */
export interface ItemView {
    itemType: string;
    key: string;
    category: string;
    /** Equip slot 0-2, null unless this is equipment. */
    slot: number | null;
    rarity: number;
    effect: ItemEffect | null;
    name: string;
    description: string;
}

/** One stack in a wallet. */
export interface InventoryEntry {
    item: ItemView;
    /** Serialized as a string: a uint256 balance does not fit a JS number. */
    quantity: string;
}

/** One filled equip slot. */
export interface EquippedItem {
    slot: number;
    item: ItemView;
}

/** An item a wallet has earned but not yet minted. */
export interface PendingItem {
    entitlementId: string;
    item: ItemView;
    quantity: number;
    /** 'battle_drop' | 'admin_grant'. */
    source: string;
    /** The battle id for a drop, so a UI can say which fight paid it. */
    sourceRef: string;
    createdAt: string;
}

/**
 * What a wallet has earned but not claimed.
 *
 * Its own read rather than part of `getInventory`, because these are not items yet: they
 * are a promise of one, and nothing on chain reflects them until a claim mints. Folding
 * them into the bag would show a player a stack they cannot spend.
 */
export async function getPendingItems(chain: string, owner: string): Promise<PendingItem[]> {
    const rows = await findUnclaimedEntitlements(chain, normalizeAccount(owner));
    if (rows.length === 0) {
        return [];
    }

    const catalog = await definitionsByType(rows.map((row) => row.itemType));
    const pending: PendingItem[] = [];
    for (const row of rows) {
        const definition = catalog.get(row.itemType);
        if (!definition) {
            console.warn(`[inventory] entitlement ${row.id} names uncatalogued item type ${row.itemType}; hidden`);
            continue;
        }
        pending.push({
            entitlementId: row.id,
            item: definition,
            quantity: row.quantity,
            source: row.source,
            sourceRef: row.sourceRef,
            createdAt: row.createdAt.toISOString(),
        });
    }
    return pending;
}

export async function getCatalog(): Promise<ItemView[]> {
    return (await findAllDefinitions()).map(toItemView);
}

/**
 * A wallet's items, newest catalog data joined onto live balances.
 *
 * The owner is normalized here rather than at the call site, because it is a lookup key
 * against rows indexer-go wrote lowercased, and an unnormalized spelling would silently
 * return an empty bag rather than an error.
 */
export async function getInventory(chain: string, owner: string): Promise<InventoryEntry[]> {
    const balances = await findBalances(chain, normalizeAccount(owner));
    if (balances.length === 0) {
        return [];
    }

    const catalog = await definitionsByType(balances.map((b) => b.itemType));
    const entries: InventoryEntry[] = [];
    for (const balance of balances) {
        const definition = catalog.get(balance.itemType);
        if (!definition) {
            console.warn(`[inventory] held item type ${balance.itemType} is not in the catalog; hidden from ${owner}`);
            continue;
        }
        entries.push({ item: definition, quantity: balance.quantity.toString() });
    }
    return entries;
}

/** What one pet has equipped, empty slots omitted. */
export async function getPetEquipment(chain: string, petId: string): Promise<EquippedItem[]> {
    const slots = await findEquipment(chain, petId);
    if (slots.length === 0) {
        return [];
    }

    const catalog = await definitionsByType(slots.map((s) => s.itemType));
    const equipped: EquippedItem[] = [];
    for (const slot of slots) {
        const definition = catalog.get(slot.itemType);
        if (!definition) {
            console.warn(`[inventory] pet ${petId} has uncatalogued item type ${slot.itemType} in slot ${slot.slot}`);
            continue;
        }
        equipped.push({ slot: slot.slot, item: definition });
    }
    return equipped;
}

/** One pet's gear, as the batched read returns it. */
export interface PetEquipmentGroup {
    petId: string;
    equipped: EquippedItem[];
}

/**
 * What several pets have equipped, in one round trip.
 *
 * The gallery and the battle arena both draw a whole roster at once, so the per-pet read
 * would cost a query per card. One catalog fetch covers all of them too, which is the other
 * half of the saving — the same sword on four pets is looked up once.
 *
 * Pets with nothing equipped are omitted rather than returned empty. The caller is building a
 * lookup, and an absent key already means "no gear"; sending rows to say nothing would grow
 * the response with the size of the roster instead of the amount of gear on it.
 */
export async function getPetEquipmentForPets(
    chain: string,
    petIds: string[],
): Promise<PetEquipmentGroup[]> {
    const rows = await findEquipmentForPets(chain, petIds);
    if (rows.length === 0) {
        return [];
    }

    const catalog = await definitionsByType(rows.map((row) => row.itemType));
    const byPet = new Map<string, EquippedItem[]>();
    for (const row of rows) {
        const definition = catalog.get(row.itemType);
        if (!definition) {
            console.warn(`[inventory] pet ${row.petId} has uncatalogued item type ${row.itemType} in slot ${row.slot}`);
            continue;
        }
        const bucket = byPet.get(row.petId);
        if (bucket) bucket.push({ slot: row.slot, item: definition });
        else byPet.set(row.petId, [{ slot: row.slot, item: definition }]);
    }

    return [...byPet].map(([petId, equipped]) => ({ petId, equipped }));
}

async function definitionsByType(itemTypes: string[]): Promise<Map<string, ItemView>> {
    const unique = [...new Set(itemTypes)];
    const rows = await findDefinitions(unique);
    return new Map(rows.map((row) => [row.itemType, toItemView(row)]));
}

function toItemView(row: ItemDefinitionRow): ItemView {
    const effect = asItemEffect(row.effect);
    if (row.effect !== null && effect === null) {
        // Readable but unrecognised: the item still renders, without whatever it does.
        // Loud because the only writer is the seeder, so this means the stored shape and
        // the code that reads it have diverged.
        console.warn(`[inventory] item ${row.itemType} (${row.key}) has an unreadable effect payload`);
    }
    return {
        itemType: row.itemType,
        key: row.key,
        category: row.category,
        slot: row.slot,
        rarity: row.rarity,
        effect,
        name: row.name,
        description: row.description,
    };
}
