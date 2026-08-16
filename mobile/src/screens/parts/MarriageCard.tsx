import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSpousePet, type OpponentPet, type Pet } from '@shared/core';

import PetArt from '../../components/PetArt';
import { neon } from '../../theme/neon';

type Props = {
    pet: Pet;
    /** The spouse's id. The caller has already established this pet is married. */
    spouseId: string;
    petById: Map<string, OpponentPet>;
    busy: boolean;
    onDivorce: (petId: string) => void;
};

/**
 * One marriage.
 *
 * The card used to call `useMarriageInfo(pet)` itself and render null for a single pet, so
 * the screen rendered one card per pet and each decided whether to exist. `useMarriedPets`
 * now settles that before anything renders — a pager cannot ask a page whether it should
 * have been allocated.
 */
export default function MarriageCard({ pet, spouseId, petById, busy, onDivorce }: Props) {
    const fromMap = petById.get(spouseId)?.name;

    /**
     * The roster map only holds what `useAllPets` fetched, and a spouse is usually
     * someone else's pet, so it is often absent. Without this the card falls back
     * to "married to pet #123", which is the id the player already cannot use.
     *
     * `skip` keeps it from firing when the map already answered.
     */
    const fetched = useSpousePet(pet.chain, spouseId, { skip: Boolean(fromMap) });

    const spouseName = fromMap ?? fetched.name;

    return (
        <View style={styles.card}>
            {/* Only the caller's own pet gets art: the spouse is usually someone else's,
                so `useSpousePet` often has a name and nothing else to render from. */}
            <PetArt pet={pet} size={40} />
            <View style={styles.body}>
                <Text style={styles.name}>{pet.name}</Text>
                <Text style={styles.spouse}>married to {spouseName ?? `pet #${spouseId}`}</Text>
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
    },
    body: {
        flex: 1,
        marginLeft: 10,
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
