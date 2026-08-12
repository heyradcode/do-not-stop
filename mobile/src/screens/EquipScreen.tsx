import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { RouteProp } from '@react-navigation/native';
import { useRoute } from '@react-navigation/native';
import {
    describeItemEffect,
    getRarityColor,
    SLOT,
    useChainCapabilities,
    useEquipItem,
    useInventory,
    usePetEquipment,
    usePetList,
    type ItemDefinition,
} from '@shared/core';

import ItemArt from '../components/ItemArt';
import PetPicker from '../components/PetPicker';
import { useNotifyError } from '../hooks/useNotifyError';
import { useTxErrorToast } from '../hooks/useTxErrorToast';
import type { RootStackParamList } from '../navigation/routes';
import { neon, neonGlow } from '../theme/neon';

const SLOTS = [
    { index: SLOT.weapon, label: 'Weapon' },
    { index: SLOT.armor, label: 'Armor' },
    { index: SLOT.trinket, label: 'Trinket' },
] as const;

/**
 * Gear a pet (roadmap §4).
 *
 * Composes the shared hooks directly and keeps its state local. Per CLAUDE.md a
 * controller hook is for a multi-step state machine the player watches, and an equip has
 * none: one transaction whose only interim state is the wallet.
 *
 * **The player signs this, and no backend can.** `ItemCore.equip` requires `msg.sender`
 * to be the pet's owner, which is what makes gear in a battle snapshot checkable against
 * chain state by someone who does not trust the operator. The wallet prompt is the
 * feature, not friction to design away.
 *
 * All three slots are drawn whether filled or not. An empty slot is information; showing
 * only what is equipped would make a bare pet look like a pet with no slots.
 *
 * The lists refresh from the indexed projection rather than the chain, so a confirmed
 * transaction shows up one indexer poll later. That lag is the cost of having one source
 * of truth for what a pet is wearing.
 */
export default function EquipScreen() {
    const route = useRoute<RouteProp<RootStackParamList, 'Equip'>>();
    const { activeKind: chain, isConnected } = useChainCapabilities();
    const { pets } = usePetList();
    const notifyError = useNotifyError();

    const [selected, setSelected] = useState(route.params?.petId ?? '');
    /** Which item is chosen per slot, before the player commits it. */
    const [choice, setChoice] = useState<Record<number, string>>({});

    const petId = selected || null;
    const { entries } = useInventory({ chain });
    const { bySlot, isLoading: slotsLoading } = usePetEquipment({ chain, petId });
    const { canEquip, equip, unequip, equipLifecycle, unequipLifecycle, isPending } = useEquipItem({
        chain,
        petId,
    });

    useTxErrorToast((equipLifecycle.error ?? unequipLifecycle.error) as Error | null);

    /**
     * Held equipment bucketed by slot, filtered from the bag rather than fetched again:
     * the inventory read is already on screen and an item's slot is part of its
     * definition, so a second query would ask the server what the client already knows.
     */
    const choicesBySlot = useMemo(() => {
        const buckets = new Map<number, ItemDefinition[]>();
        for (const entry of entries) {
            if (entry.item.category !== 'equipment' || entry.item.slot == null) continue;
            if (entry.quantity === '0') continue;
            const bucket = buckets.get(entry.item.slot);
            if (bucket) bucket.push(entry.item);
            else buckets.set(entry.item.slot, [entry.item]);
        }
        return buckets;
    }, [entries]);

    const run = async (action: () => Promise<void>, label: string) => {
        if (!isConnected) {
            notifyError('Connect your wallet first', undefined, 'equip-validation');
            return;
        }
        try {
            await action();
        } catch (err) {
            notifyError(label, err as Error, 'equip');
        }
    };

    return (
        <ScrollView style={styles.root} contentContainerStyle={styles.content}>
            <Text style={styles.title}>Equip</Text>
            <Text style={styles.subtitle}>
                Equipping escrows the item into the contract until you take it off. You sign
                it yourself, which is what makes a geared pet verifiable.
            </Text>

            <PetPicker
                pets={pets.map((pet) => ({ id: pet.id, pet }))}
                selectedId={selected}
                onSelect={setSelected}
                disabled={isPending}
                emptyHint="No pets in this wallet yet."
            />

            {!canEquip ? (
                <Text style={styles.note}>
                    This chain has no item contract, so nothing can be equipped here.
                    Inventory is EVM-only for now.
                </Text>
            ) : null}

            {!petId ? (
                <Text style={styles.note}>Pick a pet to see its slots.</Text>
            ) : slotsLoading ? (
                <View style={styles.loading}>
                    <ActivityIndicator size="large" color={neon.cyan} />
                </View>
            ) : (
                SLOTS.map(({ index, label }) => {
                    const worn = bySlot.get(index);
                    const options = choicesBySlot.get(index) ?? [];
                    const picked = choice[index];

                    return (
                        <View key={index} style={styles.slot}>
                            <Text style={styles.slotLabel}>{label}</Text>

                            {worn ? (
                                <View style={styles.worn}>
                                    <ItemArt item={worn.item} size={36} />
                                    <View style={styles.wornBody}>
                                        <Text
                                            style={[
                                                styles.wornName,
                                                { color: getRarityColor(worn.item.rarity) },
                                            ]}
                                        >
                                            {worn.item.name}
                                        </Text>
                                        {describeItemEffect(worn.item.effect) ? (
                                            <Text style={styles.wornEffect}>
                                                {describeItemEffect(worn.item.effect)}
                                            </Text>
                                        ) : null}
                                    </View>
                                    <TouchableOpacity
                                        style={[styles.remove, isPending && styles.disabled]}
                                        onPress={() => {
                                            run(() => unequip(index), 'Could not unequip that item');
                                        }}
                                        disabled={isPending || !canEquip}
                                        accessibilityRole="button"
                                        accessibilityLabel={`Unequip ${label}`}
                                        activeOpacity={0.85}
                                    >
                                        <Text style={styles.removeText}>Remove</Text>
                                    </TouchableOpacity>
                                </View>
                            ) : options.length === 0 ? (
                                <Text style={styles.slotEmpty}>
                                    Empty, and nothing in the bag fits this slot.
                                </Text>
                            ) : (
                                <>
                                    <ScrollView
                                        horizontal
                                        showsHorizontalScrollIndicator={false}
                                        style={styles.optionRow}
                                    >
                                        {options.map((item) => {
                                            const active = picked === item.itemType;
                                            return (
                                                <TouchableOpacity
                                                    key={item.itemType}
                                                    style={[styles.chip, active && styles.chipOn]}
                                                    onPress={() =>
                                                        setChoice((prev) => ({
                                                            ...prev,
                                                            [index]: item.itemType,
                                                        }))
                                                    }
                                                    disabled={isPending}
                                                    accessibilityRole="button"
                                                    accessibilityLabel={`Choose ${item.name}`}
                                                    activeOpacity={0.85}
                                                >
                                                    <ItemArt item={item} size={28} />
                                                    <Text
                                                        style={[
                                                            styles.chipName,
                                                            active && styles.chipNameOn,
                                                        ]}
                                                    >
                                                        {item.name}
                                                    </Text>
                                                    {describeItemEffect(item.effect) ? (
                                                        <Text style={styles.chipEffect}>
                                                            {describeItemEffect(item.effect)}
                                                        </Text>
                                                    ) : null}
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </ScrollView>

                                    <TouchableOpacity
                                        style={[
                                            styles.action,
                                            (!picked || isPending || !canEquip) && styles.disabled,
                                        ]}
                                        onPress={() => {
                                            run(() => equip(index, picked!), 'Could not equip that item');
                                        }}
                                        disabled={!picked || isPending || !canEquip}
                                        accessibilityRole="button"
                                        accessibilityLabel={`Equip ${label}`}
                                        activeOpacity={0.85}
                                    >
                                        <Text style={styles.actionText}>
                                            {isPending ? 'Confirm in your wallet…' : `Equip ${label}`}
                                        </Text>
                                    </TouchableOpacity>
                                </>
                            )}
                        </View>
                    );
                })
            )}
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
    subtitle: {
        fontSize: 13,
        color: neon.textMuted,
        marginTop: 6,
        marginBottom: 18,
        lineHeight: 19,
    },
    note: { fontSize: 13, color: neon.textMuted, marginTop: 8, lineHeight: 19 },
    loading: { paddingVertical: 40, alignItems: 'center' },
    slot: {
        marginTop: 16,
        backgroundColor: neon.bgPanel,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: neon.border,
        padding: 12,
    },
    slotLabel: {
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 1,
        textTransform: 'uppercase',
        color: neon.textDim,
        marginBottom: 8,
    },
    slotEmpty: { fontSize: 13, color: neon.textMuted },
    worn: { flexDirection: 'row', alignItems: 'center' },
    wornBody: { flex: 1, minWidth: 0, marginLeft: 10 },
    wornName: { fontSize: 15, fontWeight: '800' },
    wornEffect: { fontSize: 12, color: neon.textMuted, marginTop: 2 },
    remove: {
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: neon.borderMagenta,
        backgroundColor: neon.bgCard,
    },
    removeText: { color: neon.magenta, fontSize: 14, fontWeight: '700' },
    optionRow: { marginBottom: 10 },
    chip: {
        borderWidth: 1,
        borderColor: neon.border,
        backgroundColor: neon.bgCard,
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 9,
        marginRight: 8,
        minWidth: 96,
    },
    chipOn: { borderColor: neon.cyan, backgroundColor: neon.bgInput },
    chipName: { fontSize: 14, fontWeight: '700', color: neon.text },
    chipNameOn: { color: neon.cyan },
    chipEffect: { fontSize: 11, color: neon.textMuted, marginTop: 2 },
    action: {
        backgroundColor: neon.bgCard,
        borderRadius: 12,
        paddingVertical: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: neon.cyan,
        ...neonGlow(neon.cyan, 8, 0.35),
    },
    actionText: { color: neon.cyan, fontSize: 15, fontWeight: '800' },
    disabled: { opacity: 0.5 },
});
