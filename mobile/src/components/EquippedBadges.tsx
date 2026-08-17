import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { IMAGE_SERVICE_URL } from '@env';
import { getRarityColor, itemArtUrl, type EquippedItem } from '@shared/core';

import { neon } from '../theme/neon';

type Props = {
    /** Undefined until the batched read lands; empty for a bare pet. */
    equipped: readonly EquippedItem[] | undefined;
    /**
     * The **pet's** rarity, not each item's, matching frontend.
     *
     * So a pet's gear reads as one set belonging to that pet rather than three chips
     * arguing with each other and with the card's own rarity stripe. The trade is real: a
     * legendary sword and a common vest look alike here, and an item's own tier is only
     * visible in the inventory, where it is what the screen is about.
     */
    rarity: number;
    size?: number;
};

/**
 * A pet's gear, as small icons under its art.
 *
 * Gear changes what a pet does in a fight, and mobile had no way to see any of it short of
 * opening the equip screen one pet at a time — `usePetEquipmentForPets` existed with no
 * caller at all. On a gallery card it is the difference between "that pet is stronger"
 * being visible and being a surprise mid-battle.
 *
 * Laid out in a row rather than pinned over the art, unlike frontend. There it is absolutely
 * positioned inside the art's own container; here the card gives art a fixed 64px box beside
 * the text, and overlaying 18px icons on that would cover the pet rather than sit beside it.
 *
 * Nothing renders for a bare pet. Most pets have no gear, and a placeholder on every card
 * would cost more attention than the feature is worth.
 */
export default function EquippedBadges({ equipped, rarity, size = 18 }: Props) {
    if (!equipped || equipped.length === 0) return null;

    // By slot, so icons do not reshuffle between renders or between cards. Sorted on the
    // number itself rather than through a lookup, which would rank an unknown fourth slot
    // ahead of the weapon instead of after the trinket.
    const ordered = [...equipped].sort((a, b) => a.slot - b.slot);
    const tint = getRarityColor(rarity);

    return (
        <View
            style={styles.strip}
            // One label for the strip rather than one per icon: a screen reader should hear
            // "wearing Iron Fang, Hide Vest", not three images interrupting the card.
            accessibilityRole="image"
            accessibilityLabel={`Wearing ${ordered.map((entry) => entry.item.name).join(', ')}`}
        >
            {ordered.map((entry) => {
                const uri = itemArtUrl(entry.item.itemType, IMAGE_SERVICE_URL);
                const box = { width: size, height: size, borderColor: tint };
                return (
                    <View key={entry.slot} style={[styles.badge, box]}>
                        {uri ? (
                            <Image source={{ uri }} style={styles.image} resizeMode="contain" />
                        ) : (
                            // No image service configured: the rarity-tinted square still
                            // says a slot is filled, which is the part that matters.
                            <Text style={[styles.initial, { color: tint }]}>
                                {entry.item.name.slice(0, 1)}
                            </Text>
                        )}
                    </View>
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    strip: {
        flexDirection: 'row',
        marginTop: 6,
    },
    badge: {
        borderWidth: 1,
        borderRadius: 5,
        backgroundColor: neon.bgPanel,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 4,
        overflow: 'hidden',
    },
    image: {
        width: '100%',
        height: '100%',
    },
    initial: {
        fontSize: 10,
        fontWeight: '800',
    },
});
