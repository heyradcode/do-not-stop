import React from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import PetPicker from '../components/PetPicker';
import { useBreedPanel } from '../hooks/breed/useBreedPanel';
import { neon, neonGlow } from '../theme/neon';

/**
 * Breeding, as a pure view over `useBreedPanel`. Two tabs, matching frontend:
 * two pets you own, or one of yours with its spouse's (cross-owner, stud fee).
 *
 * Breeding does not use `usePetPicker`: parents are chosen from every pet, and the
 * breed cooldown is enforced on chain rather than by filtering the list here, which
 * is what frontend does too.
 */
export default function BreedScreen() {
    const panel = useBreedPanel();
    const isOwn = panel.tab === 'own';

    return (
        <ScrollView style={styles.root} contentContainerStyle={styles.content}>
            <Text style={styles.title}>Breeding Lab</Text>

            <View style={styles.tabs}>
                {(['own', 'spouse'] as const).map((t) => (
                    <TouchableOpacity
                        key={t}
                        style={[styles.tab, panel.tab === t && styles.tabActive]}
                        onPress={() => panel.onTabChange(t)}
                        activeOpacity={0.85}
                    >
                        <Text style={[styles.tabText, panel.tab === t && styles.tabTextActive]}>
                            {t === 'own' ? 'My Pets' : 'With Spouse'}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {isOwn ? (
                <>
                    {panel.petCount < 2 ? (
                        <Text style={styles.hint}>
                            You need two pets to breed on this tab. Try With Spouse instead.
                        </Text>
                    ) : null}
                    <PetPicker
                        pets={panel.allPets}
                        selectedId={panel.own.pet1}
                        onSelect={panel.own.setPet1}
                        emptyHint="No pets to breed yet."
                    />
                    <PetPicker
                        pets={panel.allPets.filter(({ id }) => id !== panel.own.pet1)}
                        selectedId={panel.own.pet2}
                        onSelect={panel.own.setPet2}
                        emptyHint="No second pet available."
                    />
                    <Text style={styles.label}>Child Name</Text>
                    <TextInput
                        style={styles.input}
                        value={panel.own.childName}
                        onChangeText={panel.own.setChildName}
                        placeholder="Name the offspring…"
                        placeholderTextColor={neon.textDim}
                        maxLength={20}
                        autoCapitalize="words"
                        autoCorrect={false}
                    />
                </>
            ) : (
                <>
                    <PetPicker
                        pets={panel.allPets}
                        selectedId={panel.spouse.petId}
                        onSelect={panel.spouse.setPetId}
                        emptyHint="No pets to breed yet."
                    />

                    {panel.spouse.petId ? (
                        <View style={styles.marriageBox}>
                            {panel.spouse.marriageLoading ? (
                                <Text style={styles.marriageText}>Checking marriage…</Text>
                            ) : panel.spouse.isMarried ? (
                                <>
                                    <Text style={styles.marriageOk}>
                                        Married to pet #{panel.spouse.spouseId}
                                    </Text>
                                    {panel.spouse.studFeeLabel ? (
                                        <Text style={styles.marriageText}>
                                            Stud fee: {panel.spouse.studFeeLabel}
                                        </Text>
                                    ) : null}
                                </>
                            ) : (
                                <Text style={styles.marriageText}>
                                    This pet is not married. Use the Marriage screen first.
                                </Text>
                            )}
                        </View>
                    ) : null}

                    <Text style={styles.label}>Child Name</Text>
                    <TextInput
                        style={styles.input}
                        value={panel.spouse.childName}
                        onChangeText={panel.spouse.setChildName}
                        placeholder="Name the offspring…"
                        placeholderTextColor={neon.textDim}
                        maxLength={20}
                        autoCapitalize="words"
                        autoCorrect={false}
                    />
                </>
            )}

            {panel.areRelated ? (
                <Text style={styles.warning}>
                    These two are related. Breeding close relatives is blocked.
                </Text>
            ) : null}

            {panel.hasPendingBreed ? (
                <Text style={styles.warning}>
                    A breed is already pending for one of these pets. Settle or cancel it first.
                </Text>
            ) : null}

            <TouchableOpacity
                style={[styles.action, panel.breedDisabled && styles.actionDisabled]}
                onPress={panel.onBreed}
                disabled={panel.breedDisabled}
                activeOpacity={0.85}
            >
                <Text style={styles.actionText}>{panel.breedButtonLabel}</Text>
            </TouchableOpacity>

            {panel.isAwaitingFulfillment ? (
                <Text style={styles.hint}>
                    Waiting for randomness. This can take a minute; leaving the screen is fine.
                    {panel.hashHint ? ` (${panel.hashHint})` : ''}
                </Text>
            ) : null}

            {panel.success ? (
                <View style={styles.success}>
                    <Text style={styles.successText}>{panel.success}</Text>
                </View>
            ) : null}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: neon.bgDeep,
    },
    content: {
        padding: 16,
        paddingBottom: 32,
    },
    title: {
        fontSize: 22,
        fontWeight: '800',
        color: neon.text,
        marginBottom: 16,
        textShadowColor: neon.cyan,
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 10,
    },
    tabs: {
        flexDirection: 'row',
        marginBottom: 20,
    },
    tab: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
        borderBottomWidth: 2,
        borderBottomColor: neon.border,
    },
    tabActive: {
        borderBottomColor: neon.cyan,
    },
    tabText: {
        fontSize: 14,
        fontWeight: '700',
        color: neon.textMuted,
    },
    tabTextActive: {
        color: neon.cyan,
    },
    label: {
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 1,
        color: neon.textMuted,
        marginBottom: 8,
    },
    input: {
        borderWidth: 1,
        borderColor: 'rgba(0, 245, 255, 0.35)',
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 16,
        color: neon.text,
        backgroundColor: neon.bgInput,
    },
    marriageBox: {
        borderWidth: 1,
        borderColor: neon.border,
        backgroundColor: neon.bgCard,
        borderRadius: 12,
        padding: 14,
        marginBottom: 16,
    },
    marriageOk: {
        color: neon.success,
        fontSize: 15,
        fontWeight: '700',
        marginBottom: 4,
    },
    marriageText: {
        color: neon.textMuted,
        fontSize: 14,
    },
    hint: {
        marginTop: 12,
        fontSize: 13,
        color: neon.textMuted,
        lineHeight: 19,
    },
    warning: {
        marginTop: 12,
        fontSize: 13,
        color: neon.magenta,
        lineHeight: 19,
    },
    action: {
        backgroundColor: neon.bgCard,
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: neon.cyan,
        marginTop: 20,
        ...neonGlow(neon.cyan, 10, 0.4),
    },
    actionDisabled: {
        opacity: 0.5,
    },
    actionText: {
        color: neon.cyan,
        fontSize: 16,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    success: {
        marginTop: 16,
        borderWidth: 1,
        borderColor: 'rgba(57, 255, 180, 0.45)',
        backgroundColor: neon.bgPanel,
        borderRadius: 12,
        padding: 14,
    },
    successText: {
        color: neon.success,
        fontSize: 14,
        fontWeight: '700',
    },
});
