import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { RouteProp } from '@react-navigation/native';
import { useRoute } from '@react-navigation/native';
import { useChainCapabilities, useDefenseAuthorization, usePetList } from '@shared/core';

import { useNotifyError } from '../hooks/useNotifyError';
import type { RootStackParamList } from '../navigation/routes';
import ActionScreenLayout from './parts/ActionScreenLayout';
import { neon } from '../theme/neon';

/**
 * Standing defence consent (§D).
 *
 * Without a grant a pet cannot be challenged at all: the backend refuses every battle
 * whose defender has no covering authorization. It is signed once rather than per
 * battle so opponents do not have to be online, and it is bound to the current
 * ruleset, so a balance patch invalidates it and asks again.
 *
 * Unlike the other action screens this one lists *all* pets, not just those off
 * cooldown: consent is about who may be challenged later, not who can act now.
 */
export default function DefenseScreen() {
    const { params } = useRoute<RouteProp<RootStackParamList, 'Defense'>>();
    const { isConnected } = useChainCapabilities();
    const { pets } = usePetList();
    const notifyError = useNotifyError();
    const { grant, revoke, isPending, error } = useDefenseAuthorization();

    const [allPets, setAllPets] = useState(true);
    const [selected, setSelected] = useState<string[]>([]);
    const [success, setSuccess] = useState<string | null>(null);

    // Arriving from a Gallery card's Defend action means one pet was chosen, so
    // narrow the scope to it rather than silently granting for the whole wallet.
    const petIdParam = params?.petId;
    useEffect(() => {
        if (!petIdParam) return;
        setAllPets(false);
        setSelected([petIdParam]);
    }, [petIdParam]);

    const toggle = (id: string) =>
        setSelected((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));

    const handleGrant = async () => {
        if (!isConnected) {
            notifyError('Please connect your wallet first', undefined, 'defense-validation');
            return;
        }
        setSuccess(null);
        const hash = await grant(allPets ? { allPets: true } : { petIds: selected });
        if (hash) {
            setSuccess(
                allPets
                    ? 'Every pet you own can now be challenged.'
                    : `${selected.length} pet${selected.length === 1 ? '' : 's'} can now be challenged.`,
            );
        }
    };

    const handleRevoke = async () => {
        setSuccess(null);
        if (await revoke()) {
            setSuccess('Consent withdrawn. Your pets can no longer be challenged.');
        }
    };

    const nothingChosen = !allPets && selected.length === 0;

    return (
        <ActionScreenLayout
            title="Allow Challenges"
            subtitle="Let other players battle your pets while you are away."
            success={success}
            error={error ? error.message : null}
            actionLabel={isPending ? 'Signing…' : 'Allow Challenges'}
            onAction={handleGrant}
            actionDisabled={isPending || nothingChosen || !isConnected}
            secondary={{ label: 'Withdraw', onPress: handleRevoke, disabled: isPending || !isConnected }}
        >
            <TouchableOpacity
                style={styles.row}
                onPress={() => setAllPets((v) => !v)}
                activeOpacity={0.8}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: allPets }}
            >
                <View style={[styles.box, allPets && styles.boxChecked]}>
                    {allPets ? <Text style={styles.check}>✓</Text> : null}
                </View>
                <Text style={styles.rowLabel}>All my pets, including ones I get later</Text>
            </TouchableOpacity>

            {!allPets ? (
                <View style={styles.petList}>
                    {pets.map((pet) => {
                        const checked = selected.includes(pet.id);
                        return (
                            <TouchableOpacity
                                key={pet.id}
                                style={styles.row}
                                onPress={() => toggle(pet.id)}
                                activeOpacity={0.8}
                                accessibilityRole="checkbox"
                                accessibilityState={{ checked }}
                            >
                                <View style={[styles.box, checked && styles.boxChecked]}>
                                    {checked ? <Text style={styles.check}>✓</Text> : null}
                                </View>
                                <Text style={styles.rowLabel}>
                                    {pet.name} (Level {pet.level})
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                    {pets.length === 0 ? (
                        <Text style={styles.empty}>No pets to authorize yet.</Text>
                    ) : null}
                </View>
            ) : null}

            {/* Mirrors useDefenseAuthorization's DEFAULTS, which are not exported. */}
            <Text style={styles.terms}>
                Valid 30 days, up to 50 battles per day. You can withdraw at any time, and a rules
                change ends it automatically.
            </Text>
        </ActionScreenLayout>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
    },
    box: {
        width: 22,
        height: 22,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: neon.border,
        backgroundColor: neon.bgInput,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    boxChecked: {
        borderColor: neon.cyan,
        backgroundColor: neon.bgCard,
    },
    check: {
        color: neon.cyan,
        fontSize: 14,
        fontWeight: '900',
    },
    rowLabel: {
        flex: 1,
        fontSize: 15,
        color: neon.text,
    },
    petList: {
        borderTopWidth: 1,
        borderTopColor: neon.border,
        marginTop: 4,
        paddingTop: 4,
    },
    empty: {
        fontSize: 14,
        color: neon.textMuted,
        paddingVertical: 12,
    },
    terms: {
        marginTop: 16,
        fontSize: 13,
        color: neon.textDim,
        lineHeight: 19,
    },
});
