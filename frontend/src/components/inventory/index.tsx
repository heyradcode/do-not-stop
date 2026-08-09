import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    explainItem,
    getRarityColor,
    getRarityName,
    useChainCapabilities,
    useInventory,
    usePendingItems,
    useSpendItem,
    usePetList,
    type InventoryEntry,
    type ItemDefinition,
} from '@shared/core';

import DashboardPanel from '@components/common/dashboard-panel';
import SessionGate from '@components/common/session-gate';
import ItemArt from '@components/item/item-art';
import Icon, { MuscleIcon } from '@components/ui/icon';
import InfoTooltip from '@components/ui/info-tooltip';
import NeonButton from '@components/ui/neon-button';
import ItemDetailModal from './item-detail-modal';
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

/**
 * One inventory slot: art, with the four things worth knowing in its corners.
 *
 *   top-left      rarity           bottom-left   how many
 *   top-right     what it does     bottom-right  what you can do with it
 *
 * The whole slot opens the detail modal, but it is deliberately NOT a button. Two of those
 * corners are themselves controls, and a button inside a button is invalid and loses keyboard
 * behaviour. Instead a transparent button is stretched across the slot and the corner
 * controls are layered above it — siblings, not descendants, so each is reachable on its own
 * and the large easy target survives for everything else.
 */
const ItemTile: React.FC<{
    item: ItemDefinition;
    quantity: string;
    action?: React.ReactNode;
    onOpen: () => void;
}> = ({ item, quantity, action, onOpen }) => (
    <div
        className={styles.tile}
        style={{ '--rarity': getRarityColor(item.rarity) } as React.CSSProperties}
    >
        <div className={styles.slot}>
            <ItemArt item={item} />

            {/* Beneath the corner controls, above everything else: a click anywhere on the
                art opens the detail modal, and the two real buttons sit on top of it. */}
            <button
                type="button"
                className={styles.open}
                onClick={onOpen}
                aria-label={`${item.name}, ${quantity} held — open details`}
            />

            <span className={styles.badge}>{getRarityName(item.rarity)}</span>
            <span className={styles.count}>×{quantity}</span>

            <span className={styles.help}>
                <InfoTooltip subject={item.name}>
                    <p>{explainItem(item)}</p>
                </InfoTooltip>
            </span>

            {action ? <span className={styles.slotAction}>{action}</span> : null}
        </div>

        <span className={styles.tileTitle}>{item.name}</span>
    </div>
);

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

    /** The item whose detail modal is open. Holds the entry, not just the id, so the modal
     *  keeps rendering its own quantity while a refetch is in flight. */
    const [selected, setSelected] = useState<InventoryEntry | null>(null);

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

    /**
     * The compact action in a slot's bottom-right corner.
     *
     * Icon-only because the corner is ~26px, so the accessible name carries what the glyph
     * cannot — including *why* it is disabled, which is the one thing a greyed button with no
     * words can never explain. Same operation as the modal's button, just without the room
     * for a label.
     */
    const slotActionFor = (entry: InventoryEntry): React.ReactNode => {
        if (entry.item.category === 'consumable' && chain) {
            return (
                <button
                    type="button"
                    className={styles.slotButton}
                    disabled={isSpending || !selectedPet}
                    aria-label={
                        selectedPet
                            ? `Use ${entry.item.name} on ${petName(pets, selectedPet)}`
                            : `Use ${entry.item.name} — pick a pet first`
                    }
                    title={selectedPet ? `Use on ${petName(pets, selectedPet)}` : 'Pick a pet first'}
                    onClick={() => {
                        void spend({ chain, petId: selectedPet!, itemType: entry.item.itemType });
                    }}
                >
                    <Icon as={MuscleIcon} size="0.95em" noGap />
                </button>
            );
        }
        if (entry.item.category === 'equipment') {
            return (
                <button
                    type="button"
                    className={styles.slotButton}
                    aria-label={`Equip ${entry.item.name} on a pet`}
                    title="Equip on a pet"
                    onClick={() => navigate(EQUIP_PATH)}
                >
                    <Icon as={MuscleIcon} size="0.95em" noGap />
                </button>
            );
        }
        return null;
    };

    /**
     * What the modal offers for one item. Built here rather than in the modal because only
     * this component knows the chain and the selected pet — the modal's job is presenting an
     * item, not deciding what may be done to one.
     */
    const actionFor = (entry: InventoryEntry): React.ReactNode => {
        if (entry.item.category === 'consumable' && chain) {
            return (
                <NeonButton
                    tone="amber"
                    size="sm"
                    disabled={isSpending || !selectedPet}
                    onClick={() => {
                        // Closes only once the burn has settled: closing on click would hide
                        // the failure, and leaving it open on success would show a stale count.
                        void spend({ chain, petId: selectedPet!, itemType: entry.item.itemType })
                            .then(() => setSelected(null))
                            .catch(() => undefined);
                    }}
                >
                    <Icon as={MuscleIcon} size="1.05em" noGap />
                    {isSpending
                        ? ' Using…'
                        : selectedPet
                            ? ` Use on ${petName(pets, selectedPet)}`
                            : ' Pick a pet first'}
                </NeonButton>
            );
        }
        if (entry.item.category === 'equipment') {
            // Equipping is a wallet signature against one pet, so it belongs on the pet
            // rather than in the bag. A link, not a note: telling a player where to go
            // without taking them there is a dead end.
            return (
                <NeonButton tone="amber" size="sm" onClick={() => navigate(EQUIP_PATH)}>
                    <Icon as={MuscleIcon} size="1.05em" noGap />
                    {' Equip on a pet'}
                </NeonButton>
            );
        }
        return null;
    };

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
                                            <ItemTile
                                                key={entry.item.itemType}
                                                item={entry.item}
                                                quantity={entry.quantity}
                                                action={slotActionFor(entry)}
                                                onOpen={() => setSelected(entry)}
                                            />
                                        ))}
                                    </div>
                                </section>
                            ))}
                        </>
                    )}
                </div>
            </DashboardPanel>

            {selected ? (
                <ItemDetailModal
                    isOpen
                    onClose={() => setSelected(null)}
                    item={selected.item}
                    quantity={selected.quantity}
                    action={actionFor(selected)}
                    error={spendError as Error | null}
                />
            ) : null}
        </SessionGate>
    );
};

export default Inventory;
