import React, { useMemo, useState } from 'react';
import clsx from 'clsx';
import { useNavigate } from 'react-router-dom';
import {
    explainItem,
    getRarityColor,
    getRarityName,
    itemStats,
    SLOT_NAMES,
    useChainCapabilities,
    useInventory,
    usePendingItems,
    useSpendItem,
    usePetList,
    type ItemDefinition,
} from '@shared/core';

import DashboardPanel from '@components/common/dashboard-panel';
import SessionGate from '@components/common/session-gate';
import ItemArt, { hasItemArt } from '@components/item/item-art';
import Icon, { BottleIcon, MuscleIcon } from '@components/ui/icon';
import InfoTooltip from '@components/ui/info-tooltip';
import { DASHBOARD_HOME, EQUIP_PATH } from '@constants/interactionRoutes';
import { Tones } from '@constants/tones';
import styles from './index.module.css';

/**
 * The bag (roadmap §4).
 *
 * Grouped by category rather than shown as one flat grid, because the categories are not
 * a taxonomy imposed on the items — they are what a player can *do* with one. A consumable
 * has a button, a piece of equipment goes on a pet somewhere else, and a collectible does
 * nothing at all. Sorting those together would make the screen's only question ("what can
 * I use?") the hardest one to answer.
 *
 * Rarity colour comes from `getRarityColor`, the same function the pet cards use, so the
 * five tiers mean one thing across the app rather than two.
 */

/** The selected pet's name, for the action button's accessible label. Falls back to the id
 *  rather than going silent, since the label's whole job is saying which pet. */
function petName(pets: { id: unknown; name: string }[], petId: string): string {
    return pets.find((pet) => String(pet.id) === petId)?.name ?? `pet ${petId}`;
}

/** Display order: what you can act on first, what merely accumulates last. */
const CATEGORY_ORDER = ['consumable', 'equipment', 'collectible', 'material'] as const;

const CATEGORY_LABELS: Record<string, string> = {
    consumable: 'Consumables',
    equipment: 'Equipment',
    collectible: 'Collectibles',
    material: 'Materials',
};

const ItemCard: React.FC<{
    item: ItemDefinition;
    quantity: string;
    action?: React.ReactNode;
}> = ({ item, quantity, action }) => {
    const stats = itemStats(item.effect);
    const slot = item.category === 'equipment' && item.slot != null ? SLOT_NAMES[item.slot] : null;
    const withArt = hasItemArt(item.itemType);

    const help = (
        <InfoTooltip subject={item.name}>
            <p>{explainItem(item)}</p>
        </InfoTooltip>
    );

    return (
        <article
            className={styles.card}
            style={{ '--rarity': getRarityColor(item.rarity) } as React.CSSProperties}
        >
            {/* The "?" sits in the tile's top-right corner, which only exists when there is a
                tile — with no image service the whole component renders nothing, so it moves
                to the footer instead of being positioned against a box that is not there. */}
            {withArt ? <ItemArt item={item} overlay={<span className={styles.artHelp}>{help}</span>} /> : null}
            <header className={styles.cardHead}>
                <h3 className={styles.cardName}>{item.name}</h3>
                {/* Rendered even at one, so a stack of one and a stack of nine read the
                    same shape rather than the badge appearing to mean something. */}
                <span className={styles.quantity}>×{quantity}</span>
            </header>

            <p className={styles.meta}>
                <span className={styles.rarity}>{getRarityName(item.rarity)}</span>
                {slot ? <span className={styles.slot}>{slot}</span> : null}
            </p>

            {/* Abbreviated so a bonus reads at a glance and several fit one row. The long
                form lives behind the "?" rather than being cut from the card entirely. */}
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

            <p className={styles.description}>{item.description}</p>

            {/* Omitted entirely when it would be empty: with the "?" on the artwork, a
                collectible has nothing to put here and an empty row would still cost its
                padding. */}
            {action || !withArt ? (
                <div className={styles.cardFoot}>
                    {withArt ? null : <span className={styles.footHelp}>{help}</span>}
                    {action ? <div className={styles.cardAction}>{action}</div> : null}
                </div>
            ) : null}
        </article>
    );
};

const Inventory: React.FC = () => {
    const navigate = useNavigate();
    const back = () => navigate(DASHBOARD_HOME);
    // `activeKind` is the PetChain value (null when disconnected); `kind` is the adapter's
    // own discriminator and is not what these queries take.
    const { activeKind: chain } = useChainCapabilities();

    const { entries, isLoading, error, refetch } = useInventory({ chain });
    const { pending, claim, claimingId, claimError } = usePendingItems(chain);
    const { pets } = usePetList();
    const { spend, isPending: isSpending, error: spendError } = useSpendItem();

    /**
     * Which pet a consumable applies to.
     *
     * A single selection for the whole screen rather than one per card. Using an item is
     * "give this to that pet", and asking again on every card would make a one-click action
     * a two-step one every time.
     */
    const [petId, setPetId] = useState<string | null>(null);
    const selectedPet = petId ?? (pets[0] ? String(pets[0].id) : null);

    const grouped = useMemo(() => {
        const byCategory = new Map<string, typeof entries>();
        for (const entry of entries) {
            const bucket = byCategory.get(entry.item.category);
            if (bucket) {
                bucket.push(entry);
            } else {
                byCategory.set(entry.item.category, [entry]);
            }
        }
        return CATEGORY_ORDER.map((category) => ({
            category,
            label: CATEGORY_LABELS[category] ?? category,
            items: byCategory.get(category) ?? [],
        })).filter((group) => group.items.length > 0);
    }, [entries]);

    const failure = (error ?? spendError ?? claimError) as Error | null;

    return (
        <SessionGate
            title="Inventory"
            connectPrompt="Connect your wallet to see what you are carrying."
            signInPrompt="Sign in to load your items."
            tone={Tones.Amber}
            back={back}
        >
            <DashboardPanel
                title="Inventory"
                description="Everything your wallet is carrying."
                back={back}
                className={styles.page}
                actions={
                    <button type="button" className={styles.refresh} onClick={refetch}>
                        Refresh
                    </button>
                }
            >
                {/* One scrolling region for the whole body. `.panel-body` clips, so without
                    this the bag is cut off at the panel's edge with no way to reach the rest. */}
                <div className={styles.scroll}>
                    {failure ? (
                        <p className={styles.error} role="alert">
                            {failure.message}
                        </p>
                    ) : null}

                    {pending.length > 0 ? (
                        <section className={styles.pending} aria-labelledby="pending-heading">
                            <h2 id="pending-heading" className={styles.sectionTitle}>
                                Waiting to be claimed
                            </h2>
                            {/* Its own strip above the bag, because these are not items yet:
                                claiming is what mints them, and until then there is nothing on
                                chain to spend. */}
                            <ul className={styles.pendingList}>
                                {pending.map((entry) => (
                                    <li key={entry.entitlementId} className={styles.pendingRow}>
                                        <span
                                            className={styles.pendingDot}
                                            style={{ background: getRarityColor(entry.item.rarity) }}
                                            aria-hidden
                                        />
                                        <span className={styles.pendingName}>
                                            {entry.item.name} ×{entry.quantity}
                                        </span>
                                        <span className={styles.pendingSource}>
                                            {entry.source === 'battle_drop' ? 'Battle drop' : 'Granted'}
                                        </span>
                                        <button
                                            type="button"
                                            className={styles.claim}
                                            onClick={() => void claim(entry.entitlementId)}
                                            disabled={claimingId != null}
                                        >
                                            {claimingId === entry.entitlementId ? 'Claiming…' : 'Claim'}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    ) : null}

                    {isLoading ? (
                        <p className={styles.muted}>Loading your items…</p>
                    ) : grouped.length === 0 ? (
                        <p className={styles.muted}>
                            Nothing yet. Items drop from battles, so fight something.
                        </p>
                    ) : (
                        <>
                            {pets.length > 0 ? (
                                <label className={styles.petPicker}>
                                    <span className={styles.petPickerLabel}>Use items on</span>
                                    <select
                                        value={selectedPet ?? ''}
                                        onChange={(event) => setPetId(event.target.value)}
                                    >
                                        {pets.map((pet) => (
                                            <option key={String(pet.id)} value={String(pet.id)}>
                                                {pet.name}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            ) : null}

                            {grouped.map((group) => (
                                <section key={group.category} aria-labelledby={`group-${group.category}`}>
                                    <h2 id={`group-${group.category}`} className={styles.sectionTitle}>
                                        {group.label}
                                    </h2>
                                    <div className={styles.grid}>
                                        {group.items.map((entry) => (
                                            <ItemCard
                                                key={entry.item.itemType}
                                                item={entry.item}
                                                quantity={entry.quantity}
                                                action={
                                                    entry.item.category === 'consumable' && chain ? (
                                                        // Icon-only, but never label-only: the
                                                        // accessible name says which item and
                                                        // which pet, because "Use" alone is the
                                                        // one thing a screen reader user cannot
                                                        // recover from the surrounding card.
                                                        <button
                                                            type="button"
                                                            className={clsx(styles.iconAction, !selectedPet && styles.disabled)}
                                                            disabled={isSpending || !selectedPet}
                                                            aria-label={
                                                                selectedPet
                                                                    ? `Use ${entry.item.name} on ${petName(pets, selectedPet)}`
                                                                    : `Use ${entry.item.name} — pick a pet first`
                                                            }
                                                            title={isSpending ? 'Using…' : 'Use'}
                                                            onClick={() =>
                                                                void spend({
                                                                    chain,
                                                                    petId: selectedPet!,
                                                                    itemType: entry.item.itemType,
                                                                })
                                                            }
                                                        >
                                                            <Icon as={BottleIcon} size="1.15em" noGap />
                                                        </button>
                                                    ) : entry.item.category === 'equipment' ? (
                                                        // Equipping is a wallet signature against
                                                        // one pet, so it belongs on the pet rather
                                                        // than in the bag. A link, not a note: the
                                                        // player is holding gear and wants to use
                                                        // it, and telling them where without
                                                        // taking them there is a dead end.
                                                        <button
                                                            type="button"
                                                            className={styles.iconAction}
                                                            aria-label={`Equip ${entry.item.name} on a pet`}
                                                            title="Equip on a pet"
                                                            onClick={() => navigate(EQUIP_PATH)}
                                                        >
                                                            <Icon as={MuscleIcon} size="1.15em" noGap />
                                                        </button>
                                                    ) : null
                                                }
                                            />
                                        ))}
                                    </div>
                                </section>
                            ))}
                        </>
                    )}
                </div>
            </DashboardPanel>
        </SessionGate>
    );
};

export default Inventory;
