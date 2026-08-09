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
import type { RouteProp } from '@react-navigation/native';
import { useRoute } from '@react-navigation/native';

import PetPicker from '../components/PetPicker';
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
        <ScrollView style={styles.root} contentContainerStyle={styles.content}>
            <Text style={styles.title}>Battle Arena</Text>

            <Text style={styles.label}>Your fighter</Text>
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
                <Text style={styles.hint}>No opponents available right now.</Text>
            ) : (
                panel.opponents.slice(0, 20).map((o) => {
                    const delta = getLevelDelta(panel.fighter?.level ?? null, o.level);
                    const tier = getMatchTier(delta);
                    const label = getMatchLabel(tier, delta);
                    const active = o.id === panel.selectedOpponentId;
                    return (
                        <TouchableOpacity
                            key={`${o.owner}::${o.id}`}
                            style={[styles.oppRow, active && styles.oppRowActive]}
                            onPress={() => panel.onSelectOpponent(o.id)}
                            disabled={panel.isBusy}
                            activeOpacity={0.85}
                        >
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

            <TouchableOpacity
                style={[styles.action, panel.isBusy && styles.actionDisabled]}
                onPress={panel.onStartBattle}
                disabled={panel.isBusy}
                activeOpacity={0.85}
            >
                <Text style={styles.actionText}>
                    {panel.isBusy ? 'Fighting…' : 'Start Battle'}
                </Text>
            </TouchableOpacity>

            {panel.validationError ? (
                <Text style={styles.warning}>{panel.validationError}</Text>
            ) : null}

            <Modal
                visible={panel.result != null}
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
                            </>
                        ) : null}
                        <TouchableOpacity
                            style={styles.action}
                            onPress={panel.onDismissResult}
                            activeOpacity={0.85}
                        >
                            <Text style={styles.actionText}>Close</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: neon.bgDeep },
    content: { padding: 16, paddingBottom: 32 },
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
    oppBody: { flex: 1 },
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
});
