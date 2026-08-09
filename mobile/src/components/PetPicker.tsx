import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { ReadyPet } from '@shared/core';

import { neon } from '../theme/neon';

type Props = {
    pets: ReadyPet[];
    selectedId: string;
    onSelect: (id: string) => void;
    /** Shown when nothing is selectable, e.g. every pet is on cooldown. */
    emptyHint: string;
    /**
     * Whether the wallet holds any pets at all, before this screen's filter.
     * Only the cooldown-filtered screens pass it: there an empty roster and a
     * fully filtered one look identical, so `emptyHint` would tell a player
     * with no pets that theirs are busy. Screens whose `emptyHint` already
     * states a fact of their own ("No pets on this chain yet") omit it.
     */
    hasAnyPets?: boolean;
    disabled?: boolean;
};

const NO_PETS_HINT = 'No pets in this wallet yet. Mint one from the Gallery tab.';

/**
 * Horizontal chips in place of frontend's `<select>`. RN has no native picker
 * without a dependency, and the lists here are short: only pets off cooldown.
 */
export default function PetPicker({
    pets,
    selectedId,
    onSelect,
    emptyHint,
    hasAnyPets,
    disabled,
}: Props) {
    if (pets.length === 0) {
        return (
            <View style={styles.empty}>
                <Text style={styles.emptyText}>
                    {hasAnyPets === false ? NO_PETS_HINT : emptyHint}
                </Text>
            </View>
        );
    }

    return (
        <View>
            <Text style={styles.label}>Select Pet</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.row}>
                {pets.map(({ id, pet }) => {
                    const active = id === selectedId;
                    return (
                        <TouchableOpacity
                            key={id}
                            style={[styles.chip, active && styles.chipActive, disabled && styles.chipDisabled]}
                            onPress={() => onSelect(id)}
                            disabled={disabled}
                            activeOpacity={0.85}
                        >
                            <Text style={[styles.chipName, active && styles.chipNameActive]}>
                                {pet.name}
                            </Text>
                            <Text style={styles.chipLevel}>Lv.{pet.level}</Text>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    label: {
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 1,
        color: neon.textMuted,
        marginBottom: 8,
    },
    row: {
        marginBottom: 16,
    },
    chip: {
        borderWidth: 1,
        borderColor: neon.border,
        backgroundColor: neon.bgCard,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 10,
        marginRight: 10,
        alignItems: 'center',
        minWidth: 90,
    },
    chipActive: {
        borderColor: neon.cyan,
        backgroundColor: neon.bgInput,
    },
    chipDisabled: {
        opacity: 0.5,
    },
    chipName: {
        fontSize: 15,
        fontWeight: '700',
        color: neon.text,
    },
    chipNameActive: {
        color: neon.cyan,
    },
    chipLevel: {
        fontSize: 12,
        color: neon.textMuted,
        marginTop: 2,
    },
    empty: {
        paddingVertical: 20,
        alignItems: 'center',
    },
    emptyText: {
        fontSize: 14,
        color: neon.textMuted,
        textAlign: 'center',
        lineHeight: 20,
    },
});
