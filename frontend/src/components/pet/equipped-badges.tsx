import React from 'react';
import { getRarityColor, itemArtUrl as buildItemArtUrl, type EquippedItem } from '@shared/core';

import styles from './equipped-badges.module.css';

/**
 * A pet's gear, as small icons pinned to the corner of its art.
 *
 * Gear changes what a pet does in a fight, and until now the only way to see any of it was to
 * open the equip panel one pet at a time. On a gallery card or a combatant card it is the
 * difference between "that pet is stronger" being discoverable and being a surprise mid-battle.
 *
 * Positioned absolutely, so the caller must place it inside the art's own positioned
 * container — the same one `<PetArt fill>` fills. Both current callers already qualify,
 * because a filling image needs a positioned ancestor for exactly the same reason.
 *
 * Renders nothing for a bare pet rather than an empty strip: most pets have no gear, and a
 * placeholder on every card would cost more attention than the feature is worth.
 */

/** Slot order, so a pet's icons do not reshuffle between renders or between cards. */
const SLOT_ORDER = [0, 1, 2];

export type EquippedBadgesProps = {
    equipped: readonly EquippedItem[] | undefined;
    /**
     * The **pet's** rarity tier, not each item's.
     *
     * So a pet's gear reads as one set belonging to that pet, rather than three chips arguing
     * with each other and with the card's own rarity bar. The trade is real and worth knowing:
     * a Legendary sword and a Common vest now look the same here, and an item's own tier is
     * only visible in the inventory, where it is what the screen is about.
     */
    rarity: number;
    /** Bigger on a combatant card, which is the subject of its screen. */
    size?: 'sm' | 'md';
};

const EquippedBadges: React.FC<EquippedBadgesProps> = ({ equipped, rarity, size = 'sm' }) => {
    if (!equipped || equipped.length === 0) return null;

    const ordered = [...equipped].sort(
        (a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot),
    );

    return (
        <div
            className={size === 'md' ? styles.stripMd : styles.strip}
            // Set once here and inherited by every badge: custom properties cascade, and one
            // tint for the whole strip is exactly the point.
            style={{ '--rarity': getRarityColor(rarity) } as React.CSSProperties}
            // One label for the strip rather than one per icon: a screen reader should hear
            // "wearing Iron Fang, Hide Vest", not three separate images interrupting the card.
            role="img"
            aria-label={`Wearing ${ordered.map((entry) => entry.item.name).join(', ')}`}
        >
            {ordered.map((entry) => {
                const src = buildItemArtUrl(entry.item.itemType, import.meta.env.VITE_IMAGE_SERVICE_URL);
                return (
                    <span
                        key={entry.slot}
                        className={styles.badge}
                        // Native tooltip, so a mouse user can name a 20px icon without a
                        // popover competing with the card's own click target.
                        title={entry.item.name}
                    >
                        {src ? (
                            <img
                                src={src}
                                alt=""
                                aria-hidden
                                loading="lazy"
                                decoding="async"
                                className={styles.img}
                            />
                        ) : (
                            // No image service: the rarity-tinted square still says a slot is
                            // filled, which is most of the information.
                            <span className={styles.blank} aria-hidden />
                        )}
                    </span>
                );
            })}
        </div>
    );
};

export default EquippedBadges;
