import { normalizeAccount } from '@cryptopets/protocol';

import {
    findAllDefinitions,
    findBalances,
    findEquipment,
    findEquipmentForPets,
    findUnclaimedEntitlements,
    type ItemDefinitionRow,
} from '@repositories/inventory.repository';

import { asItemEffect, type ItemEffect, type StatBonus } from './catalog';

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

/**
 * The catalog as a client reads it: every row, unreadable effects included as a null.
 *
 * `getCombatCatalog` is the strict counterpart, and anything that decides a fight must use
 * that one instead.
 */
export async function getCatalog(): Promise<ItemView[]> {
    return [...(await loadCatalog()).byType.values()];
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

/**
 * What one equipped item contributes to a fight, already narrowed to the modifier.
 *
 * Distinct from `EquippedItem` because a combat caller has no use for a name or a
 * description and every use for a bonus it does not have to re-narrow. The narrowing is
 * the point: reaching this type at all means the item is catalogued equipment with a
 * readable modifier, so `snapshot.builder` has nothing left to check.
 */
export interface CombatEquippedItem {
    slot: number;
    itemType: string;
    key: string;
    bonus: StatBonus;
}

/**
 * Raised when the catalog cannot answer a question combat needs answered.
 *
 * Its own type so acceptance can turn it into a named rejection rather than a 500. Every
 * case it covers is an operational fault: the seeder is behind the contract, or a row was
 * edited into a shape the reader does not recognise. Both mean this deployment cannot
 * state the rules it is about to fight under.
 */
export class ItemCatalogError extends Error {
    constructor(detail: string) {
        super(detail);
        this.name = 'ItemCatalogError';
    }
}

/**
 * The catalog, read once per process.
 *
 * `item_definition` is backend-owned content whose only writer is `scripts/seed-item-catalog.ts`
 * — nothing in `src` inserts or updates it. Before this, every read path re-SELECTed it and
 * re-validated each row's effect JSON: three queries just to open the bag, and two more on
 * the battle-accept path, all to answer the same fifteen-row question.
 *
 * Caching for the process's life is also the *consistent* choice, not just the cheap one.
 * `servedRuleset()` already caches catalog-derived data and documents that a catalog edit
 * needs a restart. With one half frozen and the other live, a mid-process seeder run produced
 * a ruleset that did not price an item the bag was already showing.
 *
 * `unreadable` is kept beside the views because `ItemView.effect` is null for two very
 * different rows: a collectible that legitimately does nothing, and an equipment row whose
 * modifier would not parse. A display path may treat those alike; a combat path must not,
 * and the null alone cannot tell them apart.
 */
interface CachedCatalog {
    byType: Map<string, ItemView>;
    /** Types whose stored `effect` column was present but unreadable. */
    unreadable: Set<string>;
}

let cached: CachedCatalog | null = null;

async function loadCatalog(): Promise<CachedCatalog> {
    if (!cached) {
        const byType = new Map<string, ItemView>();
        const unreadable = new Set<string>();
        for (const row of await findAllDefinitions()) {
            const view = toItemView(row);
            byType.set(row.itemType, view);
            if (row.effect !== null && view.effect === null) {
                unreadable.add(row.itemType);
                // Loud because the only writer is the seeder, so this means the stored
                // shape and the code that reads it have diverged.
                console.warn(`[inventory] item ${row.itemType} (${row.key}) has an unreadable effect payload`);
            }
        }
        cached = { byType, unreadable };
    }
    return cached;
}

/**
 * How many times the catalog has been dropped.
 *
 * Read by anything holding its own cache of catalog-derived data, so dropping the catalog
 * invalidates that too. `servedRuleset` is the one such holder, and it cannot simply be
 * called from `resetItemCatalog`: `ruleset.builder` imports this module, so the call would
 * close a cycle. A number it can compare against costs nothing and points the dependency
 * the way it already runs.
 */
let generation = 0;

export function itemCatalogGeneration(): number {
    return generation;
}

/** Drops the cache, for the seeder and for tests. Also invalidates anything derived from it. */
export function resetItemCatalog(): void {
    cached = null;
    generation += 1;
}

/**
 * The catalog as the ruleset must read it.
 *
 * Strict where `getCatalog` is lenient, and the split is the rule `catalog.ts` states for
 * itself: an unreadable effect costs an item its label on a read path, but once effects
 * feed combat, dropping one silently changes a fight rather than a tooltip. An equipment
 * row whose modifier will not parse simply vanishes from `itemCatalog`, which moves
 * `rulesetHash` and invalidates every outstanding defence authorization, from one bad
 * column and a console warning.
 */
export async function getCombatCatalog(): Promise<ItemView[]> {
    const catalog = await loadCatalog();
    for (const view of catalog.byType.values()) {
        if (view.category !== 'equipment') {
            continue;
        }
        if (catalog.unreadable.has(view.itemType) || view.effect?.kind !== 'stat_bonus') {
            throw new ItemCatalogError(
                `item ${view.itemType} (${view.key}) is equipment with no readable stat_bonus; this deployment cannot state its own ruleset`,
            );
        }
    }
    return [...catalog.byType.values()];
}

/**
 * What a pet has equipped, resolved for combat.
 *
 * Refuses the two states `getPetEquipment` hides. An item with no catalog row is the
 * seeder running behind the contract; an item whose modifier will not parse is a corrupt
 * row. Either way the pet is wearing something on chain that this process cannot price,
 * and the lenient read would have it fight as though the slot were empty.
 *
 * That is worse than it sounds, because it is not merely a weaker pet. The receipt would
 * publish an ungeared snapshot while `ItemCore.equipmentOf(petId)` at the recorded
 * `sourceVersion` says otherwise, and that discrepancy is indistinguishable from the
 * operator having quietly removed the gear. §4 put `itemType` in the snapshot precisely so
 * an outsider could make that comparison; failing here keeps the answer honest.
 */
export async function getPetEquipmentForCombat(chain: string, petId: string): Promise<CombatEquippedItem[]> {
    const slots = await findEquipment(chain, petId);
    if (slots.length === 0) {
        return [];
    }

    const catalog = await loadCatalog();
    return slots.map(({ slot, itemType }) => {
        const item = catalog.byType.get(itemType);
        if (!item) {
            throw new ItemCatalogError(
                `pet ${petId} has uncatalogued item type ${itemType} equipped in slot ${slot}; the item catalog is behind the contract`,
            );
        }
        if (catalog.unreadable.has(itemType) || item.effect?.kind !== 'stat_bonus') {
            throw new ItemCatalogError(
                `pet ${petId} has item ${itemType} (${item.key}) equipped in slot ${slot}, which carries no readable stat_bonus`,
            );
        }
        return { slot, itemType, key: item.key, bonus: item.effect };
    });
}

async function definitionsByType(itemTypes: string[]): Promise<Map<string, ItemView>> {
    const catalog = await loadCatalog();
    const wanted = new Map<string, ItemView>();
    for (const itemType of new Set(itemTypes)) {
        const definition = catalog.byType.get(itemType);
        if (definition) wanted.set(itemType, definition);
    }
    return wanted;
}

function toItemView(row: ItemDefinitionRow): ItemView {
    return {
        itemType: row.itemType,
        key: row.key,
        category: row.category,
        slot: row.slot,
        rarity: row.rarity,
        // Readable but unrecognised leaves the item rendering without whatever it does.
        // `loadCatalog` records which rows those were, since this null cannot say.
        effect: asItemEffect(row.effect),
        name: row.name,
        description: row.description,
    };
}
