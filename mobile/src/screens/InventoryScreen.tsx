import React, { useState } from 'react';
import {
    ActivityIndicator,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import {
    describeItemEffect,
    explainItem,
    getRarityColor,
    itemStats,
    SLOT_NAMES,
    useChainCapabilities,
    useInventory,
    usePendingItems,
    usePetList,
    useSpendItem,
    type ItemDefinition,
} from '@shared/core';

import PetPicker from '../components/PetPicker';
import { useNotifyError } from '../hooks/useNotifyError';
import { neon, neonGlow } from '../theme/neon';

/**
 * The bag: what this wallet holds, and what it has earned but not yet minted.
 *
 * The two are drawn apart because a pending drop is not an item yet. Nothing on chain
 * reflects one until its claim lands, so listing them together would offer a stack that
 * cannot be spent or equipped.
 *
 * Quantity zero is a value, not an absence. `indexer-go` resumes from an `updatedAt`
 * watermark, so a spent stack is written as `quantity 0` rather than deleted, and a row
 * that reads zero has to render as empty rather than be mistaken for a held item.
 *
 * Equipping is not here. It needs a pet and a slot, so it lives on `EquipScreen`, reached
 * per pet from the gallery, for the same reason frontend keeps it in a panel of its own.
 */
export default function InventoryScreen() {
    const { activeKind: chain } = useChainCapabilities();
    const { entries, isLoading, error, refetch } = useInventory({ chain });
    const pending = usePendingItems(chain);
    const { pets } = usePetList();
    const { spend, isPending: isSpending } = useSpendItem();
    const notifyError = useNotifyError();

    const [open, setOpen] = useState<ItemDefinition | null>(null);
    const [targetPet, setTargetPet] = useState('');
    const [done, setDone] = useState<string | null>(null);

    const close = () => {
        setOpen(null);
        setTargetPet('');
        setDone(null);
    };

    const held = entries.filter((entry) => entry.quantity !== '0');

    // Wrapped rather than called straight from onPress: `claim` rejects on a failed
    // mint, and an unhandled rejection would leave the row looking merely slow.
    const onClaim = async (entitlementId: string, name: string) => {
        try {
            await pending.claim(entitlementId);
        } catch (err) {
            notifyError(`Could not claim ${name}`, err as Error, 'inventory-claim');
        }
    };

    const onSpend = async () => {
        if (!open || !chain) return;
        if (!targetPet) {
            notifyError('Pick a pet to use this on', undefined, 'inventory-validation');
            return;
        }
        try {
            const result = await spend({ chain, petId: targetPet, itemType: open.itemType });
            setDone(
                result.leveledUp
                    ? `Used. Level ${result.level} now, ${result.xp} XP.`
                    : `Used. ${result.xp} XP.`,
            );
            refetch();
        } catch (err) {
            notifyError('Could not use that item', err as Error, 'inventory-spend');
        }
    };

    return (
        <ScrollView style={styles.root} contentContainerStyle={styles.content}>
            <Text style={styles.title}>Inventory</Text>
            <Text style={styles.subtitle}>
                Items you hold, and drops waiting to be minted
            </Text>

            {pending.pending.length > 0 ? (
                <>
                    <Text style={styles.section}>Unclaimed</Text>
                    <Text style={styles.sectionHint}>
                        Earned in battle. Claiming mints the item on chain and costs gas,
                        which is why it is not automatic.
                    </Text>
                    {pending.pending.map((entry) => (
                        <View key={entry.entitlementId} style={styles.pendingRow}>
                            <View style={styles.pendingBody}>
                                <Text style={styles.pendingName}>{entry.item.name}</Text>
                                <Text style={styles.pendingSub}>
                                    ×{entry.quantity}
                                    {entry.source === 'battle_drop' && entry.sourceRef
                                        ? `  ·  battle #${entry.sourceRef}`
                                        : ''}
                                </Text>
                            </View>
                            <TouchableOpacity
                                style={[
                                    styles.claim,
                                    pending.claimingId === entry.entitlementId && styles.disabled,
                                ]}
                                onPress={() => {
                                    onClaim(entry.entitlementId, entry.item.name);
                                }}
                                disabled={pending.claimingId != null}
                                accessibilityRole="button"
                                accessibilityLabel={`Claim ${entry.item.name}`}
                                activeOpacity={0.85}
                            >
                                {pending.claimingId === entry.entitlementId ? (
                                    <ActivityIndicator size="small" color={neon.cyan} />
                                ) : (
                                    <Text style={styles.claimText}>Claim</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    ))}
                </>
            ) : null}

            <Text style={styles.section}>Items</Text>

            {error ? (
                <Text style={styles.error}>{error.message}</Text>
            ) : isLoading ? (
                <View style={styles.loading}>
                    <ActivityIndicator size="large" color={neon.cyan} />
                </View>
            ) : held.length === 0 ? (
                <Text style={styles.empty}>
                    Nothing here yet. Items drop from battles.
                </Text>
            ) : (
                <View style={styles.grid}>
                    {held.map(({ item, quantity }) => (
                        <TouchableOpacity
                            key={item.itemType}
                            style={[styles.tile, { borderColor: getRarityColor(item.rarity) }]}
                            onPress={() => setOpen(item)}
                            accessibilityRole="button"
                            accessibilityLabel={`Open ${item.name}`}
                            activeOpacity={0.85}
                        >
                            <Text style={styles.qty}>×{quantity}</Text>
                            <Text
                                style={[styles.tileName, { color: getRarityColor(item.rarity) }]}
                                numberOfLines={2}
                            >
                                {item.name}
                            </Text>
                            <Text style={styles.tileSub} numberOfLines={1}>
                                {item.slot != null
                                    ? (SLOT_NAMES[item.slot] ?? 'gear')
                                    : item.category}
                            </Text>
                            {describeItemEffect(item.effect) ? (
                                <Text style={styles.tileEffect} numberOfLines={2}>
                                    {describeItemEffect(item.effect)}
                                </Text>
                            ) : null}
                        </TouchableOpacity>
                    ))}
                </View>
            )}

            <Modal visible={open != null} transparent animationType="fade" onRequestClose={close}>
                <View style={styles.modalRoot}>
                    <Pressable
                        style={[StyleSheet.absoluteFillObject, styles.backdrop]}
                        onPress={close}
                        accessibilityLabel="Close item"
                    />
                    {open ? (
                        <View style={styles.sheet}>
                            <Text style={[styles.sheetName, { color: getRarityColor(open.rarity) }]}>
                                {open.name}
                            </Text>
                            <Text style={styles.sheetDesc}>{open.description}</Text>

                            {itemStats(open.effect).length > 0 ? (
                                <View style={styles.chips}>
                                    {itemStats(open.effect).map((stat) => (
                                        <View key={stat.label} style={styles.chip}>
                                            <Text style={styles.chipText}>
                                                +{stat.value} {stat.label}
                                            </Text>
                                        </View>
                                    ))}
                                </View>
                            ) : null}

                            {/* The long form, worded once in @shared/core so both clients
                                explain an item identically. */}
                            <Text style={styles.sheetExplain}>{explainItem(open)}</Text>

                            {open.category === 'consumable' ? (
                                done ? (
                                    <Text style={styles.success}>{done}</Text>
                                ) : (
                                    <>
                                        <Text style={styles.label}>Use on</Text>
                                        <PetPicker
                                            pets={pets.map((pet) => ({ id: pet.id, pet }))}
                                            selectedId={targetPet}
                                            onSelect={setTargetPet}
                                            disabled={isSpending}
                                            emptyHint="No pets in this wallet yet."
                                        />
                                        <TouchableOpacity
                                            style={[styles.action, isSpending && styles.disabled]}
                                            onPress={() => {
                                                onSpend();
                                            }}
                                            disabled={isSpending}
                                            accessibilityRole="button"
                                            accessibilityLabel="Use item"
                                            activeOpacity={0.85}
                                        >
                                            <Text style={styles.actionText}>
                                                {isSpending ? 'Using…' : 'Use'}
                                            </Text>
                                        </TouchableOpacity>
                                    </>
                                )
                            ) : null}

                            <TouchableOpacity
                                style={[styles.action, styles.secondary]}
                                onPress={close}
                                accessibilityRole="button"
                                accessibilityLabel="Close"
                                activeOpacity={0.85}
                            >
                                <Text style={styles.secondaryText}>Close</Text>
                            </TouchableOpacity>
                        </View>
                    ) : null}
                </View>
            </Modal>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: neon.bgDeep },
    content: { padding: 16, paddingBottom: 32 },
    title: {
        fontSize: 22,
        fontWeight: '800',
        color: neon.text,
        letterSpacing: 0.5,
        textShadowColor: neon.cyan,
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 10,
    },
    subtitle: { fontSize: 14, color: neon.textMuted, marginTop: 6, marginBottom: 16 },
    section: {
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 1,
        textTransform: 'uppercase',
        color: neon.textDim,
        marginTop: 16,
        marginBottom: 6,
    },
    sectionHint: { fontSize: 12, color: neon.textMuted, marginBottom: 10, lineHeight: 17 },
    pendingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: neon.bgPanel,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: neon.borderMagenta,
        padding: 12,
        marginBottom: 8,
    },
    pendingBody: { flex: 1, minWidth: 0 },
    pendingName: { fontSize: 15, fontWeight: '700', color: neon.text },
    pendingSub: { fontSize: 12, color: neon.textMuted, marginTop: 2 },
    claim: {
        minWidth: 80,
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: 10,
        alignItems: 'center',
        backgroundColor: neon.bgCard,
        borderWidth: 1,
        borderColor: neon.cyan,
    },
    claimText: { color: neon.cyan, fontSize: 14, fontWeight: '800' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
    tile: {
        width: '46%',
        margin: '2%',
        backgroundColor: neon.bgCard,
        borderRadius: 12,
        borderWidth: 1,
        padding: 12,
        minHeight: 108,
    },
    qty: { fontSize: 12, fontWeight: '800', color: neon.textMuted, marginBottom: 4 },
    tileName: { fontSize: 15, fontWeight: '800' },
    tileSub: {
        fontSize: 11,
        color: neon.textDim,
        marginTop: 4,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    tileEffect: { fontSize: 12, color: neon.textMuted, marginTop: 6 },
    loading: { paddingVertical: 40, alignItems: 'center' },
    empty: { fontSize: 14, color: neon.textMuted, lineHeight: 20 },
    error: { fontSize: 13, color: neon.danger },
    modalRoot: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
    backdrop: { backgroundColor: 'rgba(5, 5, 13, 0.88)' },
    sheet: {
        zIndex: 2,
        width: '100%',
        maxWidth: 420,
        backgroundColor: neon.bgPanel,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: neon.border,
        padding: 20,
        ...neonGlow(neon.purple, 14, 0.35),
    },
    sheetName: { fontSize: 19, fontWeight: '800' },
    sheetDesc: { fontSize: 14, color: neon.textMuted, marginTop: 6, lineHeight: 20 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12 },
    chip: {
        backgroundColor: neon.bgCard,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: neon.border,
        paddingHorizontal: 10,
        paddingVertical: 5,
        marginRight: 6,
        marginBottom: 6,
    },
    chipText: { fontSize: 12, fontWeight: '800', color: neon.cyan },
    sheetExplain: { fontSize: 13, color: neon.textMuted, marginTop: 10, lineHeight: 19 },
    label: {
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 1,
        color: neon.textMuted,
        marginTop: 16,
        marginBottom: 8,
    },
    action: {
        backgroundColor: neon.bgCard,
        borderRadius: 12,
        paddingVertical: 12,
        alignItems: 'center',
        marginTop: 12,
        borderWidth: 1,
        borderColor: neon.cyan,
        ...neonGlow(neon.cyan, 8, 0.35),
    },
    actionText: { color: neon.cyan, fontSize: 15, fontWeight: '800' },
    secondary: { borderColor: neon.purple, ...neonGlow(neon.purple, 6, 0.15) },
    secondaryText: { color: neon.purple, fontSize: 15, fontWeight: '700' },
    disabled: { opacity: 0.5 },
    success: {
        marginTop: 14,
        fontSize: 14,
        fontWeight: '700',
        color: neon.success,
    },
});
