import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import type { DialogueTurn } from '@shared/core';

import { useReduceMotion } from '../../hooks/useReduceMotion';
import { alpha, neon } from '../../theme/neon';

type Props = {
    turn: DialogueTurn;
    attackerName: string;
    defenderName: string;
};

/**
 * One line of what the two pets say to each other, on the speaker's own side.
 *
 * Every line used to land in one column with nothing to say who said it. The information was
 * there the whole time: `DialogueTurn` carries `speaker`, and `useBattlePanel` was flattening
 * the turns to their text one layer above the component that needed it.
 *
 * Side and colour both come from the speaker, so they cannot disagree: the attacker is cyan
 * and left, the defender is magenta and right, which is the pairing the rest of the battle
 * screen already uses.
 */
export default function SpeechBubble({ turn, attackerName, defenderName }: Props) {
    const reduceMotion = useReduceMotion();
    const entry = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

    useEffect(() => {
        if (reduceMotion) {
            entry.setValue(1);
            return;
        }
        const rise = Animated.timing(entry, {
            toValue: 1,
            duration: 220,
            useNativeDriver: true,
        });
        rise.start();
        // A fight can be closed mid-conversation, and an animation that outlives its
        // component drives a node that is gone.
        return () => rise.stop();
    }, [reduceMotion, entry]);

    const isAttacker = turn.speaker === 'attacker';
    const accent = isAttacker ? neon.cyan : neon.magenta;

    return (
        <Animated.View
            style={[
                styles.row,
                isAttacker ? styles.rowLeft : styles.rowRight,
                {
                    opacity: entry,
                    transform: [
                        {
                            translateY: entry.interpolate({
                                inputRange: [0, 1],
                                outputRange: [8, 0],
                            }),
                        },
                    ],
                },
            ]}
        >
            <View
                accessibilityLabel={`${isAttacker ? attackerName : defenderName} says: ${turn.text}`}
                style={[
                    styles.bubble,
                    { borderColor: accent, backgroundColor: alpha(accent, 0.08) },
                    isAttacker ? styles.bubbleLeft : styles.bubbleRight,
                ]}
            >
                <Text style={[styles.speaker, { color: accent }]} numberOfLines={1}>
                    {isAttacker ? attackerName : defenderName}
                </Text>
                <Text style={styles.text}>{turn.text}</Text>

                {/*
                 * The tail, as a rotated square tucked behind the bubble's corner. There is no
                 * icon set here and a triangle would otherwise mean an SVG dependency for
                 * eight pixels.
                 */}
                <View
                    style={[
                        styles.tail,
                        { borderColor: accent, backgroundColor: neon.bgDeep },
                        isAttacker ? styles.tailLeft : styles.tailRight,
                    ]}
                />
            </View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        marginBottom: 10,
    },
    rowLeft: { justifyContent: 'flex-start' },
    rowRight: { justifyContent: 'flex-end' },
    bubble: {
        // Never the full width: a bubble that spans the column has no side, and the side is
        // the whole point.
        maxWidth: '78%',
        borderWidth: 1,
        borderRadius: 14,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    bubbleLeft: { borderBottomLeftRadius: 4 },
    bubbleRight: { borderBottomRightRadius: 4 },
    speaker: {
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 1,
        marginBottom: 2,
    },
    text: {
        fontSize: 14,
        color: neon.text,
        lineHeight: 20,
    },
    tail: {
        position: 'absolute',
        bottom: -5,
        width: 10,
        height: 10,
        borderWidth: 1,
        transform: [{ rotate: '45deg' }],
    },
    tailLeft: { left: 10, borderTopWidth: 0, borderRightWidth: 0 },
    tailRight: { right: 10, borderTopWidth: 0, borderLeftWidth: 0 },
});
