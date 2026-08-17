import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { Pet } from '@shared/core';

import PetArt from '../../components/PetArt';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import { alpha, neon, neonGlow } from '../../theme/neon';

/** How long the composed card holds before it clears, once everything has landed. */
const HOLD_MS = 700;
/** The whole thing, so a caller can reason about it without reading the timeline below. */
const SLAM_MS = 420;
const SPEED_LINES = 14;

type Props = {
    attackerName: string;
    defenderName: string;
    /** Null once a pet leaves the ready list; the plate falls back to its name alone. */
    attacker: Pet | null;
    defender: Pet | null;
    onDone: () => void;
};

/**
 * The card that announces a fight, before the arena underneath it starts reporting one.
 *
 * Built from `Animated` and plain views. Real gradients and outlined text would mean adding
 * `react-native-svg`, and a native library that is not in the installed build throws at
 * import rather than degrading. This is the first thing shown when Start is pressed, which is
 * the worst place to find that out. The same reasoning `BattleScene` records for keeping
 * `react-native-reanimated` out.
 *
 * The timeline, which is the whole component:
 *
 * 1. the diagonal ground and the speed lines wipe out from the centre
 * 2. the two plates fly in from opposite edges and overshoot
 * 3. `VS` slams down from four times its size, and on landing flashes the screen and shakes it
 * 4. it holds, then clears
 *
 * Every value drives a transform or an opacity, so all of it runs on the native driver.
 */
export default function BattleSplash({
    attackerName,
    defenderName,
    attacker,
    defender,
    onDone,
}: Props) {
    const { width, height } = useWindowDimensions();
    const reduceMotion = useReduceMotion();

    const ground = useRef(new Animated.Value(0)).current;
    const left = useRef(new Animated.Value(0)).current;
    const right = useRef(new Animated.Value(0)).current;
    const slam = useRef(new Animated.Value(0)).current;
    const flash = useRef(new Animated.Value(0)).current;
    const shake = useRef(new Animated.Value(0)).current;
    const fade = useRef(new Animated.Value(1)).current;

    // The diagonal is longer than the screen, so an oversized square is rotated and the
    // corners are simply off screen. Cheaper than clipping and there is nothing to clip with.
    const slab = Math.max(width, height) * 1.6;

    useEffect(() => {
        if (reduceMotion) {
            // Composed, still, and held. The point of the card is who is fighting whom, and
            // that survives without any of the movement.
            [ground, left, right, slam].forEach((v) => v.setValue(1));
            const timer = setTimeout(onDone, HOLD_MS);
            return () => clearTimeout(timer);
        }

        const timeline = Animated.sequence([
            Animated.parallel([
                Animated.timing(ground, {
                    toValue: 1,
                    duration: 260,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true,
                }),
                Animated.spring(left, {
                    toValue: 1,
                    useNativeDriver: true,
                    stiffness: 180,
                    damping: 14,
                    mass: 0.9,
                }),
                Animated.spring(right, {
                    toValue: 1,
                    useNativeDriver: true,
                    stiffness: 180,
                    damping: 14,
                    mass: 0.9,
                }),
            ]),
            Animated.timing(slam, {
                toValue: 1,
                duration: SLAM_MS,
                // Back-out: it overshoots past its size and settles, which is what makes it
                // read as landing rather than as appearing.
                easing: Easing.bezier(0.2, 1.6, 0.4, 1),
                useNativeDriver: true,
            }),
            Animated.parallel([
                Animated.timing(flash, {
                    toValue: 0,
                    duration: 260,
                    useNativeDriver: true,
                }),
                Animated.sequence(
                    // Three decaying knocks. A single displacement reads as a glitch.
                    [10, -7, 4, 0].map((to) =>
                        Animated.timing(shake, {
                            toValue: to,
                            duration: 45,
                            useNativeDriver: true,
                        }),
                    ),
                ),
            ]),
            Animated.delay(HOLD_MS),
            Animated.timing(fade, {
                toValue: 0,
                duration: 220,
                useNativeDriver: true,
            }),
        ]);

        flash.setValue(0.9);
        timeline.start(({ finished }) => {
            if (finished) onDone();
        });
        // Stopped rather than left running: the arena can be closed mid-card, and a timeline
        // that outlives its component calls `onDone` against a screen that is gone.
        return () => timeline.stop();
    }, [reduceMotion, ground, left, right, slam, flash, shake, fade, onDone]);

    const lines = useMemo(
        () =>
            Array.from({ length: SPEED_LINES }, (_, i) => ({
                key: i,
                rotate: `${(180 / SPEED_LINES) * i}deg`,
            })),
        [],
    );

    const plate = (
        name: string,
        pet: Pet | null,
        accent: string,
        driver: Animated.Value,
        from: number,
    ) => (
        <Animated.View
            style={[
                styles.plate,
                {
                    opacity: driver,
                    transform: [
                        {
                            translateX: driver.interpolate({
                                inputRange: [0, 1],
                                outputRange: [from, 0],
                            }),
                        },
                    ],
                },
            ]}
        >
            <View style={[styles.portrait, { borderColor: accent }, neonGlow(accent, 18, 0.5)]}>
                {pet ? <PetArt pet={pet} size={84} /> : <Text style={styles.unknown}>?</Text>}
            </View>
            <Text
                style={[styles.name, { color: accent }]}
                numberOfLines={1}
                adjustsFontSizeToFit
            >
                {name}
            </Text>
        </Animated.View>
    );

    return (
        <Animated.View
            style={[
                StyleSheet.absoluteFillObject,
                styles.root,
                { opacity: fade, transform: [{ translateX: shake }] },
            ]}
            accessibilityLabel={`${attackerName} versus ${defenderName}`}
        >
            {/* Two slabs meeting on a diagonal, one per fighter's colour. */}
            <Animated.View
                style={[
                    styles.slab,
                    {
                        width: slab,
                        height: slab,
                        top: -slab / 2,
                        left: -slab / 4,
                        backgroundColor: alpha(neon.cyan, 0.1),
                        opacity: ground,
                        transform: [{ rotate: '-24deg' }],
                    },
                ]}
            />
            <Animated.View
                style={[
                    styles.slab,
                    {
                        width: slab,
                        height: slab,
                        bottom: -slab / 2,
                        right: -slab / 4,
                        backgroundColor: alpha(neon.magenta, 0.1),
                        opacity: ground,
                        transform: [{ rotate: '-24deg' }],
                    },
                ]}
            />

            {/* Speed lines, wiping out from the middle. */}
            <View style={styles.linesRoot} pointerEvents="none">
                {lines.map(({ key, rotate }) => (
                    <Animated.View
                        key={key}
                        style={[
                            styles.line,
                            {
                                width: slab,
                                opacity: ground.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [0, 0.18],
                                }),
                                transform: [{ rotate }, { scaleX: ground }],
                            },
                        ]}
                    />
                ))}
            </View>

            {plate(attackerName, attacker, neon.cyan, left, -width)}

            <Animated.View
                style={{
                    opacity: slam,
                    transform: [
                        {
                            scale: slam.interpolate({
                                inputRange: [0, 1],
                                outputRange: [4, 1],
                            }),
                        },
                        {
                            rotate: slam.interpolate({
                                inputRange: [0, 1],
                                outputRange: ['-18deg', '-6deg'],
                            }),
                        },
                    ],
                }}
            >
                <Text style={styles.versus}>VS</Text>
            </Animated.View>

            {plate(defenderName, defender, neon.magenta, right, width)}

            {/* The impact. Painted over everything, cleared in a quarter second. */}
            <Animated.View
                pointerEvents="none"
                style={[StyleSheet.absoluteFillObject, styles.flash, { opacity: flash }]}
            />
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    root: {
        backgroundColor: neon.bgDeep,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        zIndex: 10,
    },
    slab: {
        position: 'absolute',
    },
    linesRoot: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
    },
    line: {
        position: 'absolute',
        height: 2,
        backgroundColor: neon.text,
    },
    plate: {
        alignItems: 'center',
        paddingVertical: 12,
    },
    portrait: {
        width: 108,
        height: 108,
        borderRadius: 54,
        borderWidth: 3,
        backgroundColor: neon.bgCard,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    unknown: {
        fontSize: 44,
        fontWeight: '900',
        color: neon.textDim,
    },
    name: {
        marginTop: 10,
        fontSize: 24,
        fontWeight: '900',
        letterSpacing: 1,
        maxWidth: 260,
        textAlign: 'center',
    },
    versus: {
        fontSize: 76,
        fontWeight: '900',
        letterSpacing: 4,
        color: neon.text,
        textShadowColor: neon.magenta,
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 24,
    },
    flash: {
        backgroundColor: neon.text,
    },
});
