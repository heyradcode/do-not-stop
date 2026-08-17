import React, { useEffect, useRef } from 'react';
import { Animated, ScrollView, StyleSheet, Text, View } from 'react-native';

import { neon, neonGlow } from '../../theme/neon';

/** Matches `useLiveBattleAnimation`'s strike interval, so a bar finishes as the next lands. */
const DRAIN_MS = 700;

type Props = {
    fighterName: string;
    opponentName: string;
    hp1Percent: number;
    hp2Percent: number;
    /** Flavour line for the strike on screen, or null before the first plays. */
    flourish: string | null;
    /** Every strike so far, oldest first. */
    strikeLog: string[];
};

/**
 * One HP bar, easing to its new percentage rather than jumping.
 *
 * `Animated` from React Native core, deliberately, rather than adding
 * `react-native-reanimated`: that would mean a new native dependency, a Babel plugin and a
 * rebuild, on an emulator image with 16 KB pages where an unaligned native library will
 * not load at all. Two width interpolations do not justify any of that.
 *
 * `useNativeDriver` is false because width is a layout property, which the native driver
 * cannot animate. At two bars stepping once per strike that costs nothing worth measuring.
 */
const HpBar: React.FC<{ percent: number; color: string; label: string }> = ({
    percent,
    color,
    label,
}) => {
    const width = useRef(new Animated.Value(percent)).current;

    useEffect(() => {
        const drain = Animated.timing(width, {
            toValue: percent,
            duration: DRAIN_MS,
            useNativeDriver: false,
        });
        drain.start();
        // Stopped rather than left running: a result dismissed mid-fight unmounts this,
        // and a timing animation that outlives its component sets state on a dead node.
        return () => drain.stop();
    }, [percent, width]);

    const fill = width.interpolate({
        inputRange: [0, 100],
        outputRange: ['0%', '100%'],
        extrapolate: 'clamp',
    });

    return (
        <View style={styles.hpRow}>
            <Text style={styles.hpName} numberOfLines={1}>
                {label}
            </Text>
            <View style={styles.hpTrack}>
                <Animated.View style={[styles.hpFill, { width: fill, backgroundColor: color }]} />
            </View>
            <Text style={[styles.hpPercent, { color }]}>{Math.round(percent)}%</Text>
        </View>
    );
};

/**
 * The fight, played back strike by strike.
 *
 * Presentation only. What drives it is this client's own replay of the verified receipt,
 * so the fight shown is the fight the receipt commits to; the result card beside it is the
 * authority on who won.
 *
 * The mechanical log is worded by `describeMechanicalLogEntry` in `@shared/core`, so both
 * clients narrate a strike identically and a new combat tag has one place to be worded.
 */
export default function BattleScene({
    fighterName,
    opponentName,
    hp1Percent,
    hp2Percent,
    flourish,
    strikeLog,
}: Props) {
    const logRef = useRef<ScrollView>(null);

    return (
        <View style={styles.root}>
            <HpBar percent={hp1Percent} color={neon.cyan} label={fighterName} />
            <HpBar percent={hp2Percent} color={neon.magenta} label={opponentName} />

            {/* Reserved whether or not a strike has landed, so the log below does not
                jump up the screen when the first one plays. */}
            <View style={styles.flourishBox}>
                <Text style={styles.flourish}>{flourish ?? 'Bracing for the first strike…'}</Text>
            </View>

            {strikeLog.length > 0 ? (
                <ScrollView
                    ref={logRef}
                    style={styles.log}
                    onContentSizeChange={() => logRef.current?.scrollToEnd({ animated: true })}
                    nestedScrollEnabled
                >
                    {strikeLog.map((line, index) => (
                        <Text key={index} style={styles.logLine}>
                            {line}
                        </Text>
                    ))}
                </ScrollView>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        marginTop: 16,
        backgroundColor: neon.bgPanel,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: neon.border,
        padding: 14,
        ...neonGlow(neon.purple, 8, 0.2),
    },
    hpRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
    },
    hpName: {
        width: 84,
        fontSize: 13,
        fontWeight: '700',
        color: neon.text,
    },
    hpTrack: {
        flex: 1,
        height: 10,
        borderRadius: 5,
        backgroundColor: neon.bgInput,
        overflow: 'hidden',
        marginHorizontal: 8,
    },
    hpFill: {
        height: 10,
        borderRadius: 5,
    },
    hpPercent: {
        width: 42,
        fontSize: 12,
        fontWeight: '800',
        textAlign: 'right',
    },
    flourishBox: {
        minHeight: 40,
        justifyContent: 'center',
        marginTop: 4,
    },
    flourish: {
        fontSize: 14,
        fontWeight: '700',
        color: neon.text,
        lineHeight: 20,
    },
    log: {
        maxHeight: 132,
        marginTop: 8,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: neon.border,
        paddingTop: 8,
    },
    logLine: {
        fontSize: 12,
        color: neon.textMuted,
        marginBottom: 4,
        lineHeight: 17,
    },
});
