import React, { useState } from 'react';
import {
    ActivityIndicator,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

import { formatExpiry } from '@shared/core';

import PetPicker from '../components/PetPicker';
import PetSearchField from '../components/PetSearchField';
import Carousel from '../components/ui/Carousel';
import { useMarriagePanel } from '../hooks/marriage/useMarriagePanel';
import MarriageCard from './parts/MarriageCard';
import ScreenActionBar from './parts/ScreenActionBar';
import { neon, neonGlow } from '../theme/neon';

/**
 * Marriage, as a pure view over `useMarriagePanel`.
 *
 * The partner is chosen with `PetSearchField`, mobile's answer to frontend's
 * `PetSearchDropdown` over the same `searchPets` query. This screen used to ask for
 * the partner's numeric id outright, which only works between two players already
 * talking somewhere else.
 */
export default function MarriageScreen() {
    const panel = useMarriagePanel();
    const [myPet, setMyPet] = useState('');
    const [partnerId, setPartnerId] = useState('');

    if (panel.isDisconnected) {
        return (
            <View style={styles.centered}>
                <Text style={styles.hint}>Connect a wallet to manage marriages.</Text>
            </View>
        );
    }

    const handlePropose = async () => {
        const ok = await panel.onPropose(myPet, partnerId.trim());
        if (ok) {
            setMyPet('');
            setPartnerId('');
        }
    };

    const canPropose = Boolean(myPet && partnerId.trim() && !panel.busy);
    const isProposeTab = panel.tab === 'propose';

    return (
        <View style={styles.root}>
            <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
                <Text style={styles.title}>Marriage</Text>

                <View style={styles.tabs}>
                    {(['propose', 'accept'] as const).map((t) => (
                        <TouchableOpacity
                            key={t}
                            style={[styles.tab, panel.tab === t && styles.tabActive]}
                            onPress={() => panel.onTabChange(t)}
                            activeOpacity={0.85}
                        >
                            <Text style={[styles.tabText, panel.tab === t && styles.tabTextActive]}>
                                {t === 'propose'
                                    ? 'Propose'
                                    : `Incoming${panel.proposalCount > 0 ? ` (${panel.proposalCount})` : ''}`}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {isProposeTab ? (
                    <>
                        <Text style={styles.hint}>
                            Pick one of your pets, then search for your partner&apos;s pet by name.
                        </Text>
                        <PetPicker
                            pets={panel.chainPets.map((pet) => ({ id: pet.id, pet }))}
                            selectedId={myPet}
                            onSelect={setMyPet}
                            disabled={panel.busy}
                            emptyHint="No pets on this chain yet."
                        />
                        <Text style={styles.label}>Partner&apos;s pet</Text>
                        <PetSearchField
                            chain={panel.chain}
                            value={partnerId}
                            onChange={setPartnerId}
                            excludeIds={myPet ? [myPet] : []}
                            disabled={panel.busy}
                        />
                    </>
                ) : (
                    <>
                        {panel.proposalsLoading ? (
                            <View style={styles.centered}>
                                <ActivityIndicator color={neon.cyan} />
                            </View>
                        ) : panel.proposals.length === 0 ? (
                            <Text style={styles.hint}>No incoming proposals.</Text>
                        ) : (
                            panel.proposals.map((p) => (
                                <View key={`${p.proposerPetId}-${p.targetPetId}`} style={styles.row}>
                                    <View style={styles.rowBody}>
                                        <Text style={styles.rowTitle}>
                                            {p.proposerPetName} (#{p.proposerPetId})
                                        </Text>
                                        <Text style={styles.rowSub}>
                                            to {panel.targetPetName(p.targetPetId)}
                                        </Text>
                                        {/*
                                         * A proposal is only offered while it is live, so without
                                         * this the window is invisible: one that lapses between
                                         * opening the screen and tapping Accept simply vanishes,
                                         * and reads as never having arrived. `proposalTTL` is 60s
                                         * on this deployment, which makes that the normal case
                                         * rather than the rare one.
                                         */}
                                        <Text style={styles.rowExpiry}>
                                            Expires in {formatExpiry(p.expiry)}
                                        </Text>
                                    </View>
                                    <TouchableOpacity
                                        style={[styles.smallBtn, panel.busy && styles.actionDisabled]}
                                        onPress={() => panel.onOpenAccept(p)}
                                        disabled={panel.busy}
                                        activeOpacity={0.85}
                                    >
                                        <Text style={styles.smallBtnText}>Accept</Text>
                                    </TouchableOpacity>
                                </View>
                            ))
                        )}
                    </>
                )}

                <Text style={styles.sectionTitle}>Active marriages</Text>
                {/*
                 * The loading branch is not decoration. Without it the empty state shows
                 * while the read is still out, so a player with four marriages is told they
                 * have none every time the screen opens.
                 *
                 * The pager gets a fixed height because it sits inside this screen's
                 * ScrollView, where `flex: 1` has nothing to fill and would collapse to
                 * nothing.
                 */}
                {panel.marriagesLoading ? (
                    <ActivityIndicator color={neon.cyan} />
                ) : panel.marriedPets.length === 0 ? (
                    <Text style={styles.hint}>No active marriages.</Text>
                ) : (
                    <View style={styles.marriagePager}>
                        <Carousel
                            data={panel.marriedPets}
                            keyExtractor={(married) => married.pet.id}
                            itemLabel="Marriage"
                            renderItem={(married) => (
                                <MarriageCard
                                    pet={married.pet}
                                    spouseId={married.spouseId}
                                    petById={panel.petById}
                                    busy={panel.busy}
                                    onDivorce={panel.onDivorce}
                                />
                            )}
                        />
                    </View>
                )}
            </ScrollView>

            {/*
             * Only when it has something in it. Send Proposal belongs to the Propose tab,
             * and an empty pinned strip on the Accept tab is a border across the screen
             * saying nothing. Success is kept in it either way, because a divorce is
             * confirmed from the marriage list on both tabs.
             */}
            {isProposeTab || panel.success ? (
                <ScreenActionBar>
                    {panel.success ? (
                        <View style={styles.success}>
                            <Text style={styles.successText}>{panel.success}</Text>
                        </View>
                    ) : null}

                    {isProposeTab ? (
                        <TouchableOpacity
                            testID="action-primary"
                            style={[styles.action, styles.barItem, !canPropose && styles.actionDisabled]}
                            onPress={handlePropose}
                            disabled={!canPropose}
                            activeOpacity={0.85}
                        >
                            <Text style={styles.actionText}>
                                {panel.isProposing ? 'Proposing…' : 'Send Proposal'}
                            </Text>
                        </TouchableOpacity>
                    ) : null}
                </ScreenActionBar>
            ) : null}

            <Modal
                visible={panel.pendingAccept != null}
                transparent
                animationType="fade"
                onRequestClose={panel.onCancelAccept}
            >
                <View style={styles.modalRoot}>
                    <View style={styles.sheet}>
                        <Text style={styles.sheetTitle}>Accept proposal?</Text>
                        <Text style={styles.sheetBody}>
                            {panel.pendingAccept
                                ? `${panel.pendingAccept.proposal.proposerPetName} will marry ${panel.targetPetName(
                                      panel.pendingAccept.myPetId,
                                  )}. Breeding together unlocks a stud fee for the other owner.`
                                : ''}
                        </Text>
                        <TouchableOpacity
                            style={[styles.action, panel.isAccepting && styles.actionDisabled]}
                            accessibilityRole="button"
                            accessibilityLabel="Confirm accept"
                            onPress={panel.onConfirmAccept}
                            disabled={panel.isAccepting}
                            activeOpacity={0.85}
                        >
                            <Text style={styles.actionText}>
                                {panel.isAccepting ? 'Accepting…' : 'Accept'}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.cancelBtn}
                            onPress={panel.onCancelAccept}
                            disabled={panel.isAccepting}
                            activeOpacity={0.85}
                        >
                            <Text style={styles.cancelText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: neon.bgDeep },
    scroll: { flex: 1 },
    // Cancels the modal-driven `marginTop` on `action` for its one use inside
    // `ScreenActionBar`, whose `gap` already spaces the rows.
    barItem: { marginTop: 0 },
    content: { padding: 16, paddingBottom: 32 },
    centered: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 24,
        backgroundColor: neon.bgDeep,
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
    tabs: { flexDirection: 'row', marginBottom: 20 },
    tab: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
        borderBottomWidth: 2,
        borderBottomColor: neon.border,
    },
    tabActive: { borderBottomColor: neon.cyan },
    tabText: { fontSize: 14, fontWeight: '700', color: neon.textMuted },
    tabTextActive: { color: neon.cyan },
    hint: { fontSize: 14, color: neon.textMuted, lineHeight: 20, marginBottom: 16 },
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
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: neon.border,
        backgroundColor: neon.bgCard,
        borderRadius: 12,
        padding: 14,
        marginBottom: 10,
    },
    rowBody: { flex: 1 },
    rowTitle: { fontSize: 16, fontWeight: '700', color: neon.text },
    rowSub: { fontSize: 13, color: neon.textMuted, marginTop: 2 },
    rowExpiry: { fontSize: 12, color: neon.magenta, marginTop: 4, fontWeight: '700' },
    smallBtn: {
        borderWidth: 1,
        borderColor: neon.cyan,
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 8,
    },
    smallBtnText: { color: neon.cyan, fontSize: 13, fontWeight: '700' },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: neon.text,
        marginTop: 28,
        marginBottom: 12,
    },
    // One card (~68) plus the pager's counter row. A card that outgrows this — larger system
    // text — scrolls inside its own page rather than being cut off.
    marriagePager: { height: 104 },
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
    actionDisabled: { opacity: 0.5 },
    actionText: { color: neon.cyan, fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
    success: {
        borderWidth: 1,
        borderColor: 'rgba(57, 255, 180, 0.45)',
        backgroundColor: neon.bgPanel,
        borderRadius: 12,
        padding: 14,
    },
    successText: { color: neon.success, fontSize: 14, fontWeight: '700' },
    modalRoot: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(5, 5, 13, 0.88)',
        paddingHorizontal: 24,
    },
    sheet: {
        width: '100%',
        maxWidth: 400,
        backgroundColor: neon.bgPanel,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: neon.border,
        padding: 20,
        ...neonGlow(neon.cyan, 16, 0.45),
    },
    sheetTitle: { fontSize: 18, fontWeight: '800', color: neon.text, marginBottom: 8 },
    sheetBody: { fontSize: 14, color: neon.textMuted, lineHeight: 20 },
    cancelBtn: { paddingVertical: 12, alignItems: 'center', marginTop: 8 },
    cancelText: { color: neon.textMuted, fontSize: 14, fontWeight: '700' },
});
