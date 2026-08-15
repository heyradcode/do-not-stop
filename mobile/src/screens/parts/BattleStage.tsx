import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

import BattleScene from './BattleScene';
import BattleSplash from './BattleSplash';
import type { UseBattlePanel } from '../../hooks/battle/useBattlePanel';
import { neon, neonGlow } from '../../theme/neon';

/**
 * Everything about watching a fight, as opposed to arranging one.
 *
 * `BattleScreen` was doing both, and the arranging half is the part a player interacts with:
 * pick a pet, pick an opponent, press the button. The taunts, the replay and the verdict all
 * arrive afterwards and only ever appear once, which made the screen twice as long as the job
 * it exists for.
 *
 * Takes the whole panel rather than eleven props. It is a view over the same controller the
 * screen is a view over, split out for length and not for reuse, so a prop list enumerating
 * the fields would be a second copy of the panel's shape to keep in step.
 */
type Props = {
    panel: UseBattlePanel;
    visible: boolean;
    onClose: () => void;
};

export default function BattleStage({ panel, visible, onClose }: Props) {
    const watching = panel.hasReplay || panel.result != null;

    /**
     * The card plays once per entry, not once per fight.
     *
     * Reset on open rather than on close, so a card interrupted by closing the arena is not
     * left marked as shown, and so a second battle announces itself like the first.
     */
    const [announced, setAnnounced] = useState(false);
    useEffect(() => {
        if (visible) setAnnounced(false);
    }, [visible]);

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
            <View style={styles.stage}>
                {!announced ? (
                    <BattleSplash
                        attackerName={panel.attackerName}
                        defenderName={panel.defenderName}
                        attacker={panel.fighter}
                        defender={panel.opponent}
                        onDone={() => setAnnounced(true)}
                    />
                ) : null}

                <View style={styles.header}>
                    <Text style={styles.heading}>
                        {panel.attackerName} vs {panel.defenderName}
                    </Text>
                    <Pressable
                        onPress={onClose}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="Leave the arena"
                    >
                        <Text style={styles.close}>×</Text>
                    </Pressable>
                </View>

                {/*
                 * Something to look at before there is anything to watch. The fight runs
                 * through six backend states before a replay exists, and an empty screen for
                 * that whole time reads as the app having stopped.
                 */}
                {!watching ? (
                    <View style={styles.waiting}>
                        <ActivityIndicator size="large" color={neon.magenta} />
                        <Text style={styles.waitingText}>
                            {panel.stageLabel ?? 'Fighting…'}
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

        {/*
         * Held back until the replay finishes, or the verdict lands on top of the
         * fight the player is still watching. With no replay to play, the hook reports
         * done immediately, so a battle that cannot be animated still shows its result
         * at once.
         */}
    {panel.result != null && panel.replayDone ? (
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
    ) : null}
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    stage: {
        flex: 1,
        backgroundColor: neon.bgDeep,
        padding: 16,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    heading: {
        flex: 1,
        fontSize: 18,
        fontWeight: '800',
        color: neon.text,
    },
    close: {
        fontSize: 28,
        color: neon.magenta,
        paddingHorizontal: 8,
    },
    waiting: {
        alignItems: 'center',
        paddingVertical: 40,
    },
    waitingText: {
        marginTop: 12,
        fontSize: 14,
        color: neon.textMuted,
    },
    taunts: {
        marginTop: 16,
        borderLeftWidth: 2,
        borderLeftColor: neon.purple,
        paddingLeft: 12,
    },
    tauntLine: { fontSize: 14, color: neon.textMuted, fontStyle: 'italic', marginBottom: 6 },
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
    // The result sheet's own buttons. `BattleScreen` keeps a set of the same name for the
    // pinned Start control, and the two are not the same button: this one closes a verdict.
    action: {
        backgroundColor: neon.bgCard,
        borderRadius: 12,
        paddingVertical: 12,
        alignItems: 'center',
        marginTop: 12,
        borderWidth: 1,
        borderColor: neon.cyan,
        ...neonGlow(neon.cyan, 8, 0.3),
    },
    actionText: {
        color: neon.cyan,
        fontSize: 15,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
});
