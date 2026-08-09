/**
 * The item catalog (roadmap §4), as this service needs it for metadata and art.
 *
 * A COPY. The source of truth is `backend/src/features/inventory/catalog.data.ts`, and this
 * service cannot import it: `image-generator` is not a pnpm workspace member, keeps its own
 * lockfile, and installs with `--ignore-workspace`, so nothing under `backend/` is on its
 * module graph at build or run time.
 *
 * That makes drift the obvious failure, and `items.test.ts` is what stops it being a silent
 * one: it imports the backend file directly (which works only in-repo, at test time, because
 * that file's single import is type-only and erases) and asserts this array matches field for
 * field. Adding an item to the catalog therefore fails this package's suite until it is added
 * here too, which is the loud failure the duplication would otherwise not have.
 *
 * Only what art and metadata need is copied. `effect` is included because a marketplace
 * listing that does not say a sword gives +4 ATK is not describing the item.
 */

export const SLOT_NAMES: Record<number, string> = { 0: 'Weapon', 1: 'Armor', 2: 'Trinket' };

export type ItemCategory = 'consumable' | 'equipment' | 'collectible' | 'material';

export interface StatBonus {
    kind: 'stat_bonus';
    hp: number;
    atk: number;
    def: number;
    int: number;
    mdef: number;
}

export type ItemEffect =
    | StatBonus
    | { kind: 'grant_xp'; amount: number }
    | { kind: 'clear_battle_cooldown' };

export interface ItemDefinition {
    /** ERC-1155 token id as a decimal string, which is the item *type*. */
    itemType: string;
    key: string;
    category: ItemCategory;
    /** 'weapon' | 'armor' | 'trinket', absent unless this is equipment. */
    slot?: 'weapon' | 'armor' | 'trinket';
    /** 1-5, the same five tiers pets use. */
    rarity: number;
    effect?: ItemEffect;
    name: string;
    description: string;
}

export const ITEM_CATALOG: readonly ItemDefinition[] = [
    {
        itemType: '1',
        key: 'iron_fang',
        category: 'equipment',
        slot: 'weapon',
        rarity: 1,
        effect: { kind: 'stat_bonus', hp: 0, atk: 4, def: 0, int: 0, mdef: 0 },
        name: 'Iron Fang',
        description: 'A blunt starter blade. Chipped, but it swings.',
    },
    {
        itemType: '2',
        key: 'storm_talon',
        category: 'equipment',
        slot: 'weapon',
        rarity: 3,
        effect: { kind: 'stat_bonus', hp: 0, atk: 10, def: 0, int: 4, mdef: 0 },
        name: 'Storm Talon',
        description: 'Hums before a strike. Nobody agrees on why.',
    },
    {
        itemType: '3',
        key: 'sunder_maul',
        category: 'equipment',
        slot: 'weapon',
        rarity: 5,
        effect: { kind: 'stat_bonus', hp: 0, atk: 22, def: 0, int: 0, mdef: 0 },
        name: 'Sunder Maul',
        description: 'Too heavy for most pets. The ones who lift it rarely need a second hit.',
    },
    {
        itemType: '10',
        key: 'hide_vest',
        category: 'equipment',
        slot: 'armor',
        rarity: 1,
        effect: { kind: 'stat_bonus', hp: 12, atk: 0, def: 4, int: 0, mdef: 0 },
        name: 'Hide Vest',
        description: 'Cheap, scratchy, and better than nothing.',
    },
    {
        itemType: '11',
        key: 'scale_mail',
        category: 'equipment',
        slot: 'armor',
        rarity: 3,
        effect: { kind: 'stat_bonus', hp: 30, atk: 0, def: 10, int: 0, mdef: 0 },
        name: 'Scale Mail',
        description: 'Shed plates, re-stitched. The previous owner did not need them.',
    },
    {
        itemType: '12',
        key: 'aegis_carapace',
        category: 'equipment',
        slot: 'armor',
        rarity: 4,
        effect: { kind: 'stat_bonus', hp: 45, atk: 0, def: 16, int: 0, mdef: 6 },
        name: 'Aegis Carapace',
        description: 'Grown, not forged. It closes over a wound on its own.',
    },
    {
        itemType: '20',
        key: 'river_charm',
        category: 'equipment',
        slot: 'trinket',
        rarity: 2,
        effect: { kind: 'stat_bonus', hp: 0, atk: 0, def: 0, int: 0, mdef: 6 },
        name: 'River Charm',
        description: 'Cold to the touch, always. Wards off the worst of a spell.',
    },
    {
        itemType: '21',
        key: 'focus_sigil',
        category: 'equipment',
        slot: 'trinket',
        rarity: 4,
        effect: { kind: 'stat_bonus', hp: 0, atk: 0, def: 0, int: 12, mdef: 8 },
        name: 'Focus Sigil',
        description: 'Sharpens whatever the wearer was already thinking about.',
    },
    {
        itemType: '100',
        key: 'xp_potion_i',
        category: 'consumable',
        rarity: 1,
        effect: { kind: 'grant_xp', amount: 50 },
        name: 'Lesser Tonic',
        description: 'Tastes of copper. Grants 50 XP.',
    },
    {
        itemType: '101',
        key: 'xp_potion_ii',
        category: 'consumable',
        rarity: 3,
        effect: { kind: 'grant_xp', amount: 200 },
        name: 'Greater Tonic',
        description: 'Tastes worse, works better. Grants 200 XP.',
    },
    {
        itemType: '110',
        key: 'cooldown_draught',
        category: 'consumable',
        rarity: 2,
        effect: { kind: 'clear_battle_cooldown' },
        name: 'Second Wind',
        description: 'Clears a pet’s battle cooldown. The ache comes back later.',
    },
    {
        itemType: '200',
        key: 'crate_key',
        category: 'collectible',
        rarity: 2,
        name: 'Crate Key',
        description: 'Opens nothing yet. Crates are a later feature; the keys drop now.',
    },
    {
        itemType: '201',
        key: 'founders_badge',
        category: 'collectible',
        rarity: 5,
        name: 'Founder’s Badge',
        description: 'Proof you were here early. Does nothing else, deliberately.',
    },
    {
        itemType: '300',
        key: 'ember_shard',
        category: 'material',
        rarity: 1,
        name: 'Ember Shard',
        description: 'Still warm. Common enough that nobody keeps count.',
    },
    {
        itemType: '301',
        key: 'void_dust',
        category: 'material',
        rarity: 3,
        name: 'Void Dust',
        description: 'Pools in corners and does not settle.',
    },
];

const BY_TYPE = new Map(ITEM_CATALOG.map((item) => [item.itemType, item]));

/** Looks an item up by token id. Undefined for a type nobody defined, which is a 404. */
export const findItem = (itemType: string): ItemDefinition | undefined => BY_TYPE.get(itemType);

/** The five rarity tiers, named as pets name them. */
export const RARITY_NAMES: Record<number, string> = {
    1: 'Common',
    2: 'Uncommon',
    3: 'Rare',
    4: 'Epic',
    5: 'Legendary',
};
