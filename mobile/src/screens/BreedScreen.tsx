import React from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import PetPicker from '../components/PetPicker';
import ScreenActionBar from './parts/ScreenActionBar';
import { StudFeeBalance } from '../components/SolanaExtras';
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
        <View style={styles.root}>
            <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
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

                <StudFeeBalance />

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

                {/*
                 * Recovery for an interrupted breed. v2 breed is request then settle, so if
                 * the settle never lands the parents stay pending and cannot breed again.
                 * This used to say "settle or cancel it first" and offer neither, which left
                 * the pets stuck for good.
                 *
                 * Solana has no settle: its request resumes on the next attempt, and cancel
                 * only becomes possible once the randomness has expired.
                 */}
                {panel.pendingSolana.isPending ? (
                    <View style={styles.stuck}>
                        <Text style={styles.warning}>
                            You have an unresolved breed on Solana.{' '}
                            {panel.pendingSolana.canCancel
                                ? 'Randomness has expired — cancel to free the parents.'
                                : 'Starting a new breed will resume it and mint the offspring.'}
                        </Text>
                        {panel.pendingSolana.canCancel ? (
                            <TouchableOpacity
                                style={[
                                    styles.stuckBtn,
                                    panel.pendingSolana.cancel.isPending && styles.disabled,
                                ]}
                                onPress={() => {
                                    panel.pendingSolana.cancel.run();
                                }}
                                disabled={panel.pendingSolana.cancel.isPending}
                                accessibilityRole="button"
                                accessibilityLabel="Cancel pending breed"
                                activeOpacity={0.85}
                            >
                                <Text style={styles.stuckBtnText}>
                                    {panel.pendingSolana.cancel.isPending ? 'Cancelling…' : 'Cancel'}
                                </Text>
                            </TouchableOpacity>
                        ) : null}
                    </View>
                ) : panel.stuckBreed ? (
                    <View style={styles.stuck}>
                        <Text style={styles.warning}>
                            A breed is already pending for one of these pets. Settle it once the
                            randomness is ready, which mints the offspring, or cancel it if it has
                            not arrived.
                        </Text>
                        <View style={styles.stuckRow}>
                            {(
                                [
                                    ['Settle', panel.stuckBreed.settle, 'Settle pending breed'],
                                    ['Cancel', panel.stuckBreed.cancel, 'Cancel pending breed'],
                                ] as const
                            ).map(([label, action, a11y]) => {
                                const busy =
                                    panel.stuckBreed!.settle.isPending ||
                                    panel.stuckBreed!.cancel.isPending;
                                return (
                                    <TouchableOpacity
                                        key={label}
                                        style={[styles.stuckBtn, busy && styles.disabled]}
                                        onPress={() => {
                                            action.run();
                                        }}
                                        disabled={busy}
                                        accessibilityRole="button"
                                        accessibilityLabel={a11y}
                                        activeOpacity={0.85}
                                    >
                                        <Text style={styles.stuckBtnText}>
                                            {action.isPending ? `${label.slice(0, -1)}ing…` : label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </View>
                ) : null}
            </ScrollView>

            {/*
             * Pinned. Breed is the longest of these screens on the Own tab: two pet pickers,
             * a name field and, mid-recovery, the stuck-breed panel all sit above this.
             */}
            <ScreenActionBar>
                {panel.isAwaitingFulfillment ? (
                    <Text style={[styles.hint, styles.barItem]}>
                        Waiting for randomness. This can take a minute; leaving the screen is
                        fine.
                        {panel.hashHint ? ` (${panel.hashHint})` : ''}
                    </Text>
                ) : null}

                {panel.success ? (
                    <View style={styles.success}>
                        <Text style={styles.successText}>{panel.success}</Text>
                    </View>
                ) : null}

                <TouchableOpacity
                    testID="action-primary"
                    style={[styles.action, panel.breedDisabled && styles.actionDisabled]}
                    onPress={panel.onBreed}
                    disabled={panel.breedDisabled}
                    activeOpacity={0.85}
                >
                    <Text style={styles.actionText}>{panel.breedButtonLabel}</Text>
                </TouchableOpacity>
            </ScreenActionBar>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: neon.bgDeep,
    },
    scroll: {
        flex: 1,
    },
    // Cancels `hint`'s `marginTop` for its one use inside `ScreenActionBar`, whose `gap`
    // already spaces the rows. The other use is in the scroll, where the margin is wanted.
    barItem: { marginTop: 0 },
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
    stuck: {
        marginTop: 12,
        borderWidth: 1,
        borderColor: neon.borderMagenta,
        backgroundColor: neon.bgPanel,
        borderRadius: 12,
        padding: 12,
    },
    stuckRow: { flexDirection: 'row', marginTop: 10 },
    stuckBtn: {
        marginTop: 10,
        marginRight: 8,
        paddingHorizontal: 16,
        paddingVertical: 9,
        borderRadius: 10,
        backgroundColor: neon.bgCard,
        borderWidth: 1,
        borderColor: neon.cyan,
    },
    stuckBtnText: { color: neon.cyan, fontSize: 14, fontWeight: '800' },
    disabled: { opacity: 0.5 },
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
