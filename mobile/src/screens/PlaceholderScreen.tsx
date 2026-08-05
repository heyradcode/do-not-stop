import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { neon } from '../theme/neon';

/**
 * Stands in for a screen until Phase 4 builds it. Each real screen replaces one
 * of these, so the navigator can be wired and tested before any of them exist.
 */
export const PlaceholderScreen = ({ title }: { title: string }) => (
    <View style={styles.root}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>Not built yet.</Text>
    </View>
);

/** Named factory so each route gets a stable component identity across renders. */
export const placeholderFor = (title: string) => {
    const Screen = () => <PlaceholderScreen title={title} />;
    Screen.displayName = `Placeholder(${title})`;
    return Screen;
};

const styles = StyleSheet.create({
    root: {
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
        marginBottom: 8,
        textShadowColor: neon.cyan,
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 10,
    },
    body: {
        fontSize: 15,
        color: neon.textMuted,
    },
});
