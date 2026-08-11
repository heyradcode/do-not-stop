import React from 'react';
import clsx from 'clsx';
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
 * Which corner it pins to is the caller's call because it depends on what else is drawn over
 * the art. A gallery card has nothing below, so the gear sits bottom-right, out of the way of
 * the pet's face. A combatant bay overlays a name, a stat row and an HP bar across the bottom
 * of the same box, so gear pinned there lands on top of the readout.
 *
 * Renders nothing for a bare pet rather than an empty strip: most pets have no gear, and a
 * placeholder on every card would cost more attention than the feature is worth.
 */

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
    /**
     * Which corner of the art to pin to. Defaults to the bottom, which is right wherever the
     * art is the whole card; pass `top-right` when the caller draws a readout across the
     * bottom of the same box.
     */
    corner?: 'bottom-right' | 'top-right';
};

const EquippedBadges: React.FC<EquippedBadgesProps> = ({
    equipped,
    rarity,
    size = 'sm',
    corner = 'bottom-right',
}) => {
    if (!equipped || equipped.length === 0) return null;

    // By slot, so a pet's icons do not reshuffle between renders or between cards. Sorted on
    // the number itself rather than through a lookup table, which would rank an unknown
    // fourth slot ahead of the weapon instead of after the trinket.
    const ordered = [...equipped].sort((a, b) => a.slot - b.slot);

    return (
        <div
            className={clsx(
                size === 'md' ? styles.stripMd : styles.strip,
                corner === 'top-right' ? styles.cornerTop : styles.cornerBottom,
            )}
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
