/**
 * Public surface of the inventory feature (roadmap §4). External code imports from
 * `@features/inventory` so the internal layout can change without touching call sites.
 */
export {
    getCatalog,
    getEquipmentForPets,
    getInventory,
    getPetEquipment,
    type EquippedItem,
    type InventoryEntry,
    type ItemView,
} from './inventory.service';
export {
    assertCatalog,
    asItemEffect,
    ITEM_CATEGORIES,
    SLOT,
    type ItemCategory,
    type ItemDefinitionSeed,
    type ItemEffect,
    type SlotName,
    type StatBonus,
} from './catalog';
export { ITEM_CATALOG } from './catalog.data';
