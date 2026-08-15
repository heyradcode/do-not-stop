import React from 'react';
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { opponentKey } from '@shared/core';
import type { RouteProp } from '@react-navigation/native';
import { useRoute } from '@react-navigation/native';

import PetArt from '../components/PetArt';
import PetDetailStrip from '../components/PetDetailStrip';
import PetPicker from '../components/PetPicker';
import GlyphDivider from '../components/ui/GlyphDivider';
import BattleStage from './parts/BattleStage';
import ScreenActionBar from './parts/ScreenActionBar';
import { useBattlePanel } from '../hooks/battle/useBattlePanel';
import { getLevelDelta, getMatchLabel, getMatchTier } from '../hooks/battle/matchmaking';
import type { MainTabParamList } from '../navigation/routes';
import { neon, neonGlow } from '../theme/neon';

const TIER_COLOR: Record<string, string> = {
    easy: neon.success,
    even: neon.cyan,
    risky: neon.purple,
    danger: neon.magenta,
    unknown: neon.textDim,
};

export default function BattleScreen() {
    const { params } = useRoute<RouteProp<MainTabParamList, 'Battle'>>();
    const panel = useBattlePanel(params?.petId);

    if (!panel.isConnected) {
        return (
            <View style={styles.centered}>
                <Text style={styles.hint}>Connect a wallet to enter the arena.</Text>
            </View>
        );
    }

    return (
        <View style={styles.root}>
            <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
                <Text style={styles.title}>Battle Arena</Text>

                <Text style={styles.label}>Your fighter</Text>

                {/*
                 * A pet the wallet owns but whose record would not load. It is filtered out of
                 * the picker because there is nothing to draw, so without this the list is
                 * simply one pet short and looks like the pet was never minted.
                 */}
                {panel.petsError ? (
                    <View style={styles.petsError}>
                        <Text style={styles.petsErrorText}>{panel.petsError.message}</Text>
                        <TouchableOpacity
                            onPress={panel.retryPets}
                            accessibilityRole="button"
                            accessibilityLabel="Retry loading your pets"
                            activeOpacity={0.85}
                        >
                            <Text style={styles.petsErrorRetry}>Try again</Text>
                        </TouchableOpacity>
                    </View>
                ) : null}

                <PetPicker
                    pets={panel.readyPets}
                    selectedId={panel.selectedPetId}
                    onSelect={panel.onSelectPet}
                    disabled={panel.isBusy}
                    hasAnyPets={panel.hasAnyPets}
                    emptyHint="No pets are off cooldown. A pet that just fought has to wait."
                />

                {/* Your fighter above, the opponent below. Both are pet rows, and nothing
                    else on the screen says which side of the fight each one is. */}
                <GlyphDivider glyph="VS" />

                <View style={styles.opponentHeader}>
                    <Text style={styles.label}>Opponent</Text>
                    <TouchableOpacity
                        onPress={panel.onRandomOpponent}
                        disabled={panel.isBusy || !panel.fighter}
                        activeOpacity={0.85}
                    >
                        <Text
                            style={[
                                styles.randomText,
                                (panel.isBusy || !panel.fighter) && styles.disabled,
                            ]}
                        >
                            Random
                        </Text>
                    </TouchableOpacity>
                </View>

                {panel.opponentsLoading ? (
                    <ActivityIndicator color={neon.cyan} style={styles.spinner} />
                ) : panel.opponentsError ? (
                    <Text style={styles.warning}>
                        Could not load opponents: {panel.opponentsError.message}
                    </Text>
                ) : panel.opponents.length === 0 ? (
                    // The server says which filter emptied the list. "No opponents available"
                    // reads as the app being broken when the real answer is often that nobody
                    // has allowed challenges yet, which is another player's to fix, or that
                    // nothing has been indexed, which is not the player's at all.
                    <Text style={styles.hint}>{panel.opponentsEmptyMessage}</Text>
                ) : (
                    /*
                     * A horizontal strip of chips, the same shape as the pet picker directly
                     * above it. Both rows on this screen are "choose one of these", so they
                     * read as a pair, and roughly four opponents are in view at once with the
                     * next one half-showing to say the strip scrolls.
                     *
                     * Not a pager. One opponent per screen made choosing between twenty a
                     * swipe each, and this is the screen where you are comparing them.
                     */
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.oppRow}
                    >
                        {panel.opponents.slice(0, 20).map((o) => {
                            const delta = getLevelDelta(panel.fighter?.level ?? null, o.level);
                            const tier = getMatchTier(delta);
                            const label = getMatchLabel(tier, delta);
                            // The same key the row is identified by. Selecting on `o.id` alone
                            // picked the wrong pet when two owners hold the same id, which
                            // they can on Solana.
                            const key = opponentKey(o.owner, o.id);
                            const active = key === panel.selectedOpponentKey;
                            return (
                                <TouchableOpacity
                                    key={key}
                                    style={[styles.oppChip, active && styles.oppChipActive]}
                                    onPress={() => panel.onSelectOpponent(key)}
                                    disabled={panel.isBusy}
                                    activeOpacity={0.85}
                                >
                                    <PetArt pet={o} size={36} />
                                    <Text style={styles.oppName} numberOfLines={1}>
                                        {o.name}
                                    </Text>
                                    <Text style={styles.oppMeta}>Lv.{o.level}</Text>
                                    <Text style={styles.oppMeta}>
                                        {o.winCount}W/{o.lossCount}L
                                    </Text>
                                    {label ? (
                                        <Text
                                            style={[styles.tier, { color: TIER_COLOR[tier] }]}
                                            numberOfLines={1}
                                        >
                                            {label}
                                        </Text>
                                    ) : null}
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                )}

                {/*
                 * The chosen opponent's numbers, the same strip the picker shows for your own
                 * pet. An opponent chip is 80px of art, name and level, which is enough to
                 * scan the strip and not enough to decide a fight: the stats you are actually
                 * weighing are underneath it.
                 *
                 * `OpponentPet` extends `Pet`, so this is the same component, not a variant.
                 */}
                {panel.opponent ? <PetDetailStrip pet={panel.opponent} /> : null}

                <BattleStage panel={panel} />
            </ScrollView>

            {/*
             * Pinned rather than trailing the content. Start Battle sat below a pet picker,
             * up to twenty opponent rows and the replay, so on a full arena the one control
             * the screen exists for was several scrolls down.
             */}
            <ScreenActionBar>
                {panel.validationError ? (
                    <Text style={[styles.warning, styles.barItem]}>{panel.validationError}</Text>
                ) : null}

                {/*
                 * What the fight is waiting on. "Fighting…" covered six backend states, so a
                 * battle stalled on the independent verifier looked like one about to
                 * finish, and one that ended badly looked like one still running.
                 */}
                {panel.stageLabel ? <Text style={styles.stage}>{panel.stageLabel}</Text> : null}

                <TouchableOpacity
                    testID="action-primary"
                    style={[styles.action, styles.barItem, panel.isBusy && styles.actionDisabled]}
                    onPress={panel.onStartBattle}
                    disabled={panel.isBusy}
                    activeOpacity={0.85}
                >
                    <Text style={styles.actionText}>
                        {panel.isBusy ? 'Fighting…' : 'Start Battle'}
                    </Text>
                </TouchableOpacity>
            </ScreenActionBar>

        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: neon.bgDeep },
    scroll: { flex: 1 },
    content: { padding: 16, paddingBottom: 32 },
    /**
     * `styles.action` and `styles.warning` are also used in the result modal and above the
     * opponent list, where their `marginTop` is the spacing. Inside `ScreenActionBar` the
     * `gap` already spaces the rows, so this cancels the margin at the two bar call sites
     * rather than removing it from styles their other users still need.
     */
    barItem: { marginTop: 0 },
    centered: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: neon.bgDeep,
        padding: 24,
    },
    title: {
        fontSize: 22,
        fontWeight: '800',
        color: neon.text,
        marginBottom: 16,
        textShadowColor: neon.magenta,
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 10,
    },
    label: {
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 1,
        color: neon.textMuted,
        marginBottom: 8,
    },
    petsError: {
        borderWidth: 1,
        borderColor: neon.borderMagenta,
        backgroundColor: neon.bgPanel,
        borderRadius: 12,
        padding: 12,
        marginBottom: 12,
    },
    petsErrorText: { color: neon.magenta, fontSize: 13, lineHeight: 19 },
    petsErrorRetry: {
        color: neon.cyan,
        fontSize: 13,
        fontWeight: '800',
        marginTop: 8,
    },
    opponentHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 8,
    },
    randomText: { color: neon.cyan, fontSize: 13, fontWeight: '700' },
    disabled: { opacity: 0.4 },
    spinner: { marginVertical: 16 },
    hint: { fontSize: 14, color: neon.textMuted, lineHeight: 20, marginVertical: 8 },
    stage: {
        fontSize: 13,
        color: neon.textMuted,
        textAlign: 'center',
        lineHeight: 19,
    },
    warning: { marginTop: 12, fontSize: 13, color: neon.magenta, lineHeight: 19 },
    oppRow: {
        marginBottom: 8,
    },
    oppChip: {
        width: 80,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: neon.border,
        backgroundColor: neon.bgCard,
        borderRadius: 12,
        paddingVertical: 10,
        paddingHorizontal: 6,
        marginRight: 8,
    },
    oppChipActive: { borderColor: neon.magenta, backgroundColor: neon.bgInput },
    oppName: { fontSize: 13, fontWeight: '700', color: neon.text },
    oppMeta: { fontSize: 11, color: neon.textMuted, marginTop: 1 },
    tier: { fontSize: 10, fontWeight: '800', marginTop: 3 },
    action: {
        backgroundColor: neon.bgCard,
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: neon.magenta,
        marginTop: 20,
        ...neonGlow(neon.magenta, 10, 0.4),
    },
    actionDisabled: { opacity: 0.5 },
    actionText: { color: neon.magenta, fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
});
