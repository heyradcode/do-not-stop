import React from 'react';
import {
    ActivityIndicator,
    Modal,
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
import PetPicker from '../components/PetPicker';
import BattleScene from './parts/BattleScene';
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

    const winPct =
        panel.winProbability != null ? `${Math.round(panel.winProbability * 100)}%` : null;

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
                    panel.opponents.slice(0, 20).map((o) => {
                        const delta = getLevelDelta(panel.fighter?.level ?? null, o.level);
                        const tier = getMatchTier(delta);
                        const label = getMatchLabel(tier, delta);
                        // The same key the row is identified by. Selecting on `o.id` alone
                        // picked the wrong pet when two owners hold the same id, which they
                        // can on Solana.
                        const key = opponentKey(o.owner, o.id);
                        const active = key === panel.selectedOpponentKey;
                        return (
                            <TouchableOpacity
                                key={key}
                                style={[styles.oppRow, active && styles.oppRowActive]}
                                onPress={() => panel.onSelectOpponent(key)}
                                disabled={panel.isBusy}
                                activeOpacity={0.85}
                            >
                                <PetArt pet={o} size={40} />
                                <View style={styles.oppBody}>
                                    <Text style={styles.oppName}>{o.name}</Text>
                                    <Text style={styles.oppMeta}>
                                        Lv.{o.level} · W {o.winCount} · L {o.lossCount}
                                    </Text>
                                </View>
                                {label ? (
                                    <Text style={[styles.tier, { color: TIER_COLOR[tier] }]}>
                                        {label}
                                    </Text>
                                ) : null}
                            </TouchableOpacity>
                        );
                    })
                )}

                {panel.fighter && panel.opponent ? (
                    <View style={styles.estimate}>
                        <Text style={styles.estimateLabel}>Estimated win chance</Text>
                        <Text style={styles.estimateValue}>
                            {panel.winEstimateLoading ? '…' : (winPct ?? 'unavailable')}
                        </Text>
                    </View>
                ) : null}

                {panel.taunts.length > 0 ? (
                    <View style={styles.taunts}>
                        {panel.taunts.map((line, i) => (
                            <Text key={i} style={styles.tauntLine}>
                                {line}
                            </Text>
                        ))}
                    </View>
                ) : null}

                {panel.hasReplay ? (
                    <BattleScene
                        fighterName={panel.attackerName}
                        opponentName={panel.defenderName}
                        hp1Percent={panel.hp1Percent}
                        hp2Percent={panel.hp2Percent}
                        flourish={panel.flourish}
                        strikeLog={panel.strikeLog}
                    />
                ) : null}
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

            {/*
             * Held back until the replay finishes, or the verdict lands on top of the
             * fight the player is still watching. With no replay to play, the hook reports
             * done immediately, so a battle that cannot be animated still shows its result
             * at once.
             */}
            <Modal
                visible={panel.result != null && panel.replayDone}
                transparent
                animationType="fade"
                onRequestClose={panel.onDismissResult}
            >
                <View style={styles.modalRoot}>
                    <View style={styles.sheet}>
                        {panel.result ? (
                            <>
                                <Text
                                    style={[
                                        styles.resultTitle,
                                        {
                                            color: panel.result.firstWins
                                                ? neon.success
                                                : neon.magenta,
                                        },
                                    ]}
                                >
                                    {panel.result.firstWins ? 'Victory' : 'Defeat'}
                                </Text>
                                <Text style={styles.resultLine}>
                                    {panel.result.rounds} rounds ·{' '}
                                    {panel.result.winnerHpRemaining} HP left
                                </Text>
                                <Text style={styles.resultLine}>
                                    XP: +{panel.result.firstWins
                                        ? panel.result.xpWin
                                        : panel.result.xpLoss}
                                </Text>

                                {/*
                                 * Rendered when it arrives and skipped when it does not.
                                 * Dialogue is generated best-effort and the result is
                                 * already on screen without it, so a slow or failed
                                 * generation must not hold up the verdict.
                                 */}
                                {panel.resultTurns.length > 0 ? (
                                    <View style={styles.dialogue}>
                                        {panel.resultTurns.map((turn, i) => (
                                            <View key={i} style={styles.dialogueTurn}>
                                                <Text
                                                    style={[
                                                        styles.dialogueSpeaker,
                                                        {
                                                            color:
                                                                turn.speaker === 'attacker'
                                                                    ? neon.cyan
                                                                    : neon.magenta,
                                                        },
                                                    ]}
                                                >
                                                    {turn.speaker === 'attacker'
                                                        ? panel.attackerName
                                                        : panel.defenderName}
                                                </Text>
                                                <Text style={styles.dialogueText}>{turn.text}</Text>
                                            </View>
                                        ))}
                                    </View>
                                ) : panel.dialogueLoading ? (
                                    <Text style={styles.dialogueWaiting}>
                                        The pets are catching their breath…
                                    </Text>
                                ) : null}
                            </>
                        ) : null}
                        {panel.hasReplay ? (
                            <TouchableOpacity
                                style={styles.action}
                                onPress={panel.onReplay}
                                accessibilityRole="button"
                                accessibilityLabel="Watch again"
                                activeOpacity={0.85}
                            >
                                <Text style={styles.actionText}>Watch again</Text>
                            </TouchableOpacity>
                        ) : null}
                        <TouchableOpacity
                            style={styles.action}
                            onPress={panel.onDismissResult}
                            accessibilityRole="button"
                            accessibilityLabel="Close result"
                            activeOpacity={0.85}
                        >
                            <Text style={styles.actionText}>Close</Text>
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
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: neon.border,
        backgroundColor: neon.bgCard,
        borderRadius: 12,
        padding: 14,
        marginBottom: 8,
    },
    oppRowActive: { borderColor: neon.magenta, backgroundColor: neon.bgInput },
    oppBody: {
        marginLeft: 10, flex: 1 },
    oppName: { fontSize: 16, fontWeight: '700', color: neon.text },
    oppMeta: { fontSize: 13, color: neon.textMuted, marginTop: 2 },
    tier: { fontSize: 13, fontWeight: '800' },
    estimate: {
        marginTop: 12,
        borderWidth: 1,
        borderColor: neon.border,
        backgroundColor: neon.bgCard,
        borderRadius: 12,
        padding: 14,
        alignItems: 'center',
    },
    estimateLabel: { fontSize: 12, color: neon.textMuted, letterSpacing: 1 },
    estimateValue: { fontSize: 24, fontWeight: '900', color: neon.cyan, marginTop: 4 },
    taunts: {
        marginTop: 16,
        borderLeftWidth: 2,
        borderLeftColor: neon.purple,
        paddingLeft: 12,
    },
    tauntLine: { fontSize: 14, color: neon.textMuted, fontStyle: 'italic', marginBottom: 6 },
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
    modalRoot: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(5, 5, 13, 0.9)',
        paddingHorizontal: 24,
    },
    sheet: {
        width: '100%',
        maxWidth: 400,
        backgroundColor: neon.bgPanel,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: neon.border,
        padding: 24,
        alignItems: 'center',
        ...neonGlow(neon.magenta, 16, 0.45),
    },
    resultTitle: { fontSize: 28, fontWeight: '900', letterSpacing: 2, marginBottom: 12 },
    resultLine: { fontSize: 15, color: neon.textMuted, marginBottom: 4 },
    dialogue: {
        marginTop: 14,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: neon.border,
        paddingTop: 12,
    },
    dialogueTurn: { marginBottom: 10 },
    dialogueSpeaker: {
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.8,
        textTransform: 'uppercase',
        marginBottom: 2,
    },
    dialogueText: { fontSize: 14, color: neon.text, lineHeight: 20 },
    dialogueWaiting: { marginTop: 14, fontSize: 13, color: neon.textDim, fontStyle: 'italic' },
});
