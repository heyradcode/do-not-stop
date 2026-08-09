/**
 * ERC-1155 metadata for catalog items (roadmap §4).
 *
 * Same OpenSea-shaped document the pet metadata uses, because that is what wallets and
 * marketplaces actually read, and using two shapes in one project would mean two things to
 * keep correct.
 *
 * The interesting difference from a pet is what *isn't* here. A pet's document mixes visual
 * traits with progress (level, record) because both belong to that one animal. An item's
 * token id is its type, so this document describes a *kind* of object and nothing about any
 * particular copy: no owner, no quantity, no which-pet-is-wearing-it. Those are per-holder
 * facts, and ERC-1155 has nowhere to put them.
 *
 * Stats come from the catalog's declared `effect`, which is also what the equip path resolves
 * into a battle snapshot. Listing them matters: a marketplace page for a sword that does not
 * say +4 ATK is not describing the item, and a buyer comparing two weapons has nothing to go
 * on. Only non-zero stats are listed, so a weapon does not advertise "+0 DEF".
 */

import { RARITY_NAMES, SLOT_NAMES, type ItemDefinition } from './items.js';

export interface MetadataAttribute {
    trait_type: string;
    value: string | number;
    display_type?: string;
}

export interface ItemMetadata {
    name: string;
    description: string;
    image: string;
    external_url?: string;
    attributes: MetadataAttribute[];
}

export interface ItemMetadataOptions {
    /** Absolute URL of the item's art. */
    imageUrl: string;
    /** Optional link to the item in the game, `{id}` substituted. */
    externalUrl?: string;
}

const SLOT_INDEX: Record<string, number> = { weapon: 0, armor: 1, trinket: 2 };

/** Stat lines, in the order the game shows them, skipping zeroes. */
const STAT_LABELS: [keyof StatFields, string][] = [
    ['hp', 'HP'],
    ['atk', 'ATK'],
    ['def', 'DEF'],
    ['int', 'INT'],
    ['mdef', 'MDEF'],
];

interface StatFields {
    hp: number;
    atk: number;
    def: number;
    int: number;
    mdef: number;
}

export const buildItemMetadata = (item: ItemDefinition, options: ItemMetadataOptions): ItemMetadata => {
    const attributes: MetadataAttribute[] = [
        { trait_type: 'Category', value: item.category },
        { trait_type: 'Rarity', value: RARITY_NAMES[item.rarity] ?? 'Unknown' },
    ];

    if (item.slot !== undefined) {
        attributes.push({ trait_type: 'Slot', value: SLOT_NAMES[SLOT_INDEX[item.slot]!] ?? item.slot });
    }

    const effect = item.effect;
    if (effect?.kind === 'stat_bonus') {
        for (const [field, label] of STAT_LABELS) {
            const value = effect[field];
            // `display_type: boost_number` is what renders these as "+4" rather than a plain
            // trait row, which is the difference between reading as a stat and as a label.
            if (value > 0) attributes.push({ trait_type: label, value, display_type: 'boost_number' });
        }
    } else if (effect?.kind === 'grant_xp') {
        attributes.push({ trait_type: 'Grants XP', value: effect.amount, display_type: 'number' });
    } else if (effect?.kind === 'clear_battle_cooldown') {
        attributes.push({ trait_type: 'Effect', value: 'Clears battle cooldown' });
    }

    return {
        name: item.name,
        description: item.description,
        image: options.imageUrl,
        ...(options.externalUrl === undefined ? {} : { external_url: options.externalUrl }),
        attributes,
    };
};
