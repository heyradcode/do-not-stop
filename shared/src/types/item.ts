/**
 * The item vocabulary, shared by the backend and every client (roadmap §4).
 *
 * Here rather than in the backend feature for the same reason `CHAT_REACTIONS` is: both
 * sides have to agree, and the way they agree is by importing one declaration instead of
 * keeping two in step. The backend validates the catalog against these types and serializes
 * `effect` as JSON; a client parses it back and renders it. A second copy would drift the
 * first time an effect kind was added, and the symptom would be a client silently rendering
 * nothing rather than an error anyone notices.
 *
 * Not in `@cryptopets/protocol`, deliberately. Nothing here is hashed or signed: a battle
 * snapshot carries resolved stat numbers, not an item's declared effect, so the protocol
 * package never needs this vocabulary and does not take a dependency it cannot have.
 */

/** Equip slots, mirroring ItemCore.SLOT_*. The contract stays authoritative. */
export const SLOT = { weapon: 0, armor: 1, trinket: 2 } as const;
export type SlotName = keyof typeof SLOT;

/** Slot index back to its name, for a UI labelling what a pet is wearing. */
export const SLOT_NAMES: Record<number, SlotName> = { 0: 'weapon', 1: 'armor', 2: 'trinket' };

export const ITEM_CATEGORIES = ['consumable', 'equipment', 'collectible', 'material'] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

/**
 * Flat, non-negative additions to a pet's extracted attributes.
 *
 * Additive and non-negative only in v1, which roadmap §4 recommends and which removes a
 * real hazard: the combat engine truncates to 16 bits with wraparound rather than clamping,
 * so a negative modifier is one underflow away from a pet with 65,000 HP.
 */
export interface StatBonus {
    kind: 'stat_bonus';
    hp: number;
    atk: number;
    def: number;
    int: number;
    mdef: number;
}

/**
 * Every effect v1 can apply.
 *
 * Breeding cooldowns are absent on purpose: they are on-chain state, and clearing one needs
 * an authorized `PetCore` call the inventory feature does not have.
 */
export type ItemEffect =
    | StatBonus
    | { kind: 'grant_xp'; amount: number }
    | { kind: 'clear_battle_cooldown' };

/** One catalog entry as the API returns it, with `effect` already parsed. */
export interface ItemDefinition {
    /** ERC-1155 token id as a decimal string. The join key everywhere. */
    itemType: string;
    /** Stable content key, e.g. 'xp_potion_i'. */
    key: string;
    category: ItemCategory;
    /** Equip slot 0-2; null unless this is equipment. */
    slot: number | null;
    /** 1-5, the same five tiers as pet rarity. */
    rarity: number;
    effect: ItemEffect | null;
    name: string;
    description: string;
}

/** One stack a wallet holds. */
export interface InventoryEntry {
    item: ItemDefinition;
    /** Decimal string: a uint256 balance does not fit a JS number. */
    quantity: string;
}

/** One filled equip slot on a pet. */
export interface EquippedItem {
    slot: number;
    item: ItemDefinition;
}

/**
 * Parses the JSON string the API sends for `effect`.
 *
 * Returns null for anything unrecognised rather than throwing, matching how the backend
 * reads the same column: on a render path an unknown effect should cost one item its
 * label, not fail the whole bag. A client older than the effect kind it is looking at is
 * the ordinary case here, not an error.
 */
export function parseItemEffect(value: string | null | undefined): ItemEffect | null {
    if (!value) {
        return null;
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(value);
    } catch {
        return null;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return null;
    }
    const record = parsed as Record<string, unknown>;

    switch (record.kind) {
        case 'stat_bonus': {
            const fields = ['hp', 'atk', 'def', 'int', 'mdef'] as const;
            if (fields.some((f) => !Number.isInteger(record[f]) || (record[f] as number) < 0)) {
                return null;
            }
            const bonus: StatBonus = { kind: 'stat_bonus', hp: 0, atk: 0, def: 0, int: 0, mdef: 0 };
            for (const field of fields) {
                bonus[field] = record[field] as number;
            }
            return bonus;
        }
        case 'grant_xp':
            return Number.isInteger(record.amount) && (record.amount as number) > 0
                ? { kind: 'grant_xp', amount: record.amount as number }
                : null;
        case 'clear_battle_cooldown':
            return { kind: 'clear_battle_cooldown' };
        default:
            return null;
    }
}

/** One stat an item changes, ready to render as a chip. */
export interface ItemStat {
    /** Short label, e.g. 'ATK'. */
    label: string;
    value: number;
}

/**
 * An item's effect as separate values rather than a sentence.
 *
 * `describeItemEffect` already produces "+12 HP, +4 DEF", and a card wanting one chip per
 * stat could split that string — which is how a UI ends up depending on a comma. Wording and
 * structure are different questions, so they get different functions, and a new effect kind
 * has to answer both here rather than in whichever component noticed first.
 *
 * `clear_battle_cooldown` returns nothing: it is a real effect with no number to put in a
 * chip, and inventing "1 CD" to fill the row would be worse than the empty row. The full
 * sentence from `explainItem` is where it gets described.
 */
export function itemStats(effect: ItemEffect | null): ItemStat[] {
    if (!effect) return [];
    switch (effect.kind) {
        case 'grant_xp':
            return [{ label: 'XP', value: effect.amount }];
        case 'clear_battle_cooldown':
            return [];
        case 'stat_bonus':
            return (['hp', 'atk', 'def', 'int', 'mdef'] as const)
                .filter((field) => effect[field] > 0)
                .map((field) => ({ label: field.toUpperCase(), value: effect[field] }));
    }
}

/**
 * A full sentence saying what an item does and what using it costs.
 *
 * Longer than `describeItemEffect` on purpose: that one labels, this one explains. A card
 * shows "+4 ATK" because it has a row to fill; someone who opens the "?" is asking a
 * question the chip did not answer — whether the bonus lasts, whether the item survives
 * being used, whether a collectible does anything at all.
 *
 * Takes the whole item rather than the effect, because the honest answer for a material is
 * "nothing yet, it is for crafting", and an effect of `null` alone cannot tell a material
 * from a collectible.
 */
export function explainItem(item: ItemDefinition): string {
    const effect = item.effect;

    if (effect?.kind === 'stat_bonus') {
        const parts = itemStats(effect).map((stat) => `+${stat.value} ${stat.label}`);
        const slot = item.slot === null ? 'a pet' : `a pet's ${SLOT_NAMES[item.slot] ?? 'gear'} slot`;
        return `Equipped to ${slot}. Adds ${joinWithAnd(parts)} for the whole battle, and keeps working `
            + 'until you unequip it. The bonus is frozen into a battle when it is accepted, so unequipping '
            + 'afterwards cannot change a fight that already happened.';
    }

    if (effect?.kind === 'grant_xp') {
        return `Used on one of your pets to grant ${effect.amount} XP straight away. Consumed on use: `
            + 'the item is burned, and the XP goes to the pet you picked.';
    }

    if (effect?.kind === 'clear_battle_cooldown') {
        return 'Used on one of your pets to clear its battle cooldown, so it can fight again immediately '
            + 'instead of waiting. Consumed on use.';
    }

    if (item.category === 'material') {
        return 'A crafting material. It does nothing on its own yet — crafting is a later feature, and '
            + 'these accumulate until then.';
    }

    return 'A collectible. It has no effect in battle and nothing to spend it on, which is the point of '
        + 'it: proof you were there.';
}

const joinWithAnd = (parts: string[]): string =>
    parts.length <= 1
        ? (parts[0] ?? '')
        : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]!}`;

/**
 * A short human label for an effect, for a tooltip or a card line.
 *
 * Here rather than in a component so the web app and mobile describe an item the same way,
 * and so a new effect kind has one place to be worded.
 */
export function describeItemEffect(effect: ItemEffect | null): string | null {
    if (!effect) {
        return null;
    }
    switch (effect.kind) {
        case 'grant_xp':
            return `Grants ${effect.amount} XP`;
        case 'clear_battle_cooldown':
            return 'Clears the battle cooldown';
        case 'stat_bonus': {
            const parts = (['hp', 'atk', 'def', 'int', 'mdef'] as const)
                .filter((field) => effect[field] > 0)
                .map((field) => `+${effect[field]} ${field.toUpperCase()}`);
            return parts.length > 0 ? parts.join(', ') : null;
        }
    }
}
