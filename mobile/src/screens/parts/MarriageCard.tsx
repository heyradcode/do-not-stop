import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useMarriageInfo, type OpponentPet, type Pet } from '@shared/core';

import { neon } from '../../theme/neon';

type Props = {
    pet: Pet;
    petById: Map<string, OpponentPet>;
    busy: boolean;
    onDivorce: (petId: string) => void;
};

/**
 * One pet's marriage state. `useMarriageInfo` is per-pet, so this has to be a
 * component rather than a loop in the screen — a hook cannot run inside `map`.
 * Renders nothing when the pet is single, so the list shows only real marriages.
 */
export default function MarriageCard({ pet, petById, busy, onDivorce }: Props) {
    const info = useMarriageInfo(pet);

    if (info.isLoading || !info.isMarried) return null;

    const spouseId = info.spouseId?.toString();
    const spouseName = spouseId ? petById.get(spouseId)?.name : undefined;

    return (
        <View style={styles.card}>
            <View style={styles.body}>
                <Text style={styles.name}>{pet.name}</Text>
                <Text style={styles.spouse}>
                    married to {spouseName ?? `pet #${spouseId ?? '?'}`}
                </Text>
            </View>
            <TouchableOpacity
                style={[styles.divorce, busy && styles.disabled]}
                onPress={() => onDivorce(pet.id)}
                disabled={busy}
                activeOpacity={0.85}
            >
                <Text style={styles.divorceText}>Divorce</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: neon.border,
        backgroundColor: neon.bgCard,
        borderRadius: 12,
        padding: 14,
        marginBottom: 10,
    },
    body: {
        flex: 1,
    },
    name: {
        fontSize: 16,
        fontWeight: '700',
        color: neon.text,
    },
    spouse: {
        fontSize: 13,
        color: neon.textMuted,
        marginTop: 2,
    },
    divorce: {
        borderWidth: 1,
        borderColor: neon.borderMagenta,
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 8,
    },
    divorceText: {
        color: neon.magenta,
        fontSize: 13,
        fontWeight: '700',
    },
    disabled: {
        opacity: 0.5,
    },
});
