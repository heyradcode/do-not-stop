import React from 'react';
import { explainItem, getRarityColor, getRarityName, itemStats, SLOT_NAMES, type ItemDefinition } from '@shared/core';

import ItemArt from '@components/item/item-art';
import NeonModal from '@components/ui/neon-modal';
import styles from './index.module.css';

/**
 * Everything about one item, opened from its tile in the bag.
 *
 * The bag itself is now a wall of pictures: a tile carries the art, the name and the stack
 * count, and nothing else. That trade is the point — a grid where every card also listed its
 * rarity, slot, stats and flavour text was legible one card at a time and a texture at any
 * distance, which is the opposite of what a bag is scanned for. Detail is not lost, it is one
 * click away and gets room to be read properly when it arrives.
 *
 * This is also where the "?" went. A tooltip existed to reveal what would not fit on a card;
 * a modal that shows everything makes the question redundant.
 */

export type ItemDetailModalProps = {
    isOpen: boolean;
    onClose: () => void;
    item: ItemDefinition;
    quantity: string;
    /** Use / Equip, built by the bag because only it knows the selected pet and chain. */
    action?: React.ReactNode;
    /** A failed use, shown here rather than behind the modal where it cannot be seen. */
    error?: Error | null;
};

const ItemDetailModal: React.FC<ItemDetailModalProps> = ({
    isOpen,
    onClose,
    item,
    quantity,
    action,
    error,
}) => {
    const stats = itemStats(item.effect);
    const slot = item.category === 'equipment' && item.slot != null ? SLOT_NAMES[item.slot] : null;

    return (
        <NeonModal isOpen={isOpen} onRequestClose={onClose} title={item.name} contentClassName={styles.body}>
            <div
                className={styles.layout}
                style={{ '--rarity': getRarityColor(item.rarity) } as React.CSSProperties}
            >
                <ItemArt item={item} size="feature" />

                <div className={styles.facts}>
                    <p className={styles.meta}>
                        <span className={styles.rarity}>{getRarityName(item.rarity)}</span>
                        <span className={styles.category}>{slot ?? item.category}</span>
                        <span className={styles.held}>×{quantity} held</span>
                    </p>

                    {stats.length > 0 ? (
                        <ul className={styles.stats}>
                            {stats.map((stat) => (
                                <li key={stat.label} className={styles.stat}>
                                    <span className={styles.statLabel}>{stat.label}</span>
                                    <span className={styles.statValue}>+{stat.value}</span>
                                </li>
                            ))}
                        </ul>
                    ) : null}

                    {/* The flavour line and the mechanical one are different registers, so they
                        are not run together into one paragraph. */}
                    <p className={styles.flavour}>{item.description}</p>
                    <p className={styles.explain}>{explainItem(item)}</p>
                </div>
            </div>

            {error ? (
                <p className={styles.error} role="alert">
                    {error.message}
                </p>
            ) : null}

            {action ? <div className={styles.actions}>{action}</div> : null}
        </NeonModal>
    );
};

export default ItemDetailModal;
