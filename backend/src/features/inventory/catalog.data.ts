import type { ItemDefinitionSeed } from './catalog';

/**
 * The v1 item catalog (roadmap §4).
 *
 * Breadth is the point here rather than depth: §4 takes the wide-catalog idea from
 * OwoBot and the gear-matters idea from Dota, and says not to attempt Dota's scale on
 * day one. Fifteen items across the four shipping categories is enough to exercise every
 * path (a stackable, a burn, an equip, a slot conflict) without pretending to be content
 * design, which is a human call.
 *
 * Token ids are banded by category so a later addition slots in without renumbering, and
 * so a stray id in a log is recognisable. Nothing enforces the bands; they are a reading
 * convenience, and `key` is the identifier that actually has to stay stable.
 *
 *   1-99     equipment
 *   100-199  consumables
 *   200-299  collectibles
 *   300-399  crafting materials
 *
 * Rarity reuses the game's five tiers verbatim (shared/src/utils/pets/cosmetics.ts), so
 * pets and items share one vocabulary rather than inventing a second scale.
 */
export const ITEM_CATALOG: readonly ItemDefinitionSeed[] = [
    // ─── equipment: weapons ───────────────────────────────────────────────────
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

    // ─── equipment: armor ─────────────────────────────────────────────────────
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

    // ─── equipment: trinkets ──────────────────────────────────────────────────
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

    // ─── consumables ──────────────────────────────────────────────────────────
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

    // ─── collectibles ─────────────────────────────────────────────────────────
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

    // ─── crafting materials ───────────────────────────────────────────────────
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
