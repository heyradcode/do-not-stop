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
export { postClaim, postGrant, postUseItem } from './inventory.controller';
export {
    claimEntitlement,
    grantItem,
    isAdmin,
    useItem,
    type ClaimResult,
    type GrantResult,
    type UseItemResult,
    type WriteFailure,
} from './inventory.write';
export { getItemCoreClient, resetItemCoreClient, type ItemCoreClient } from './inventory.chain';
export {
    DEFAULT_DROP_RATES,
    recordBattleDrops,
    rollDrops,
    type Drop,
    type DropRates,
} from './drops';
