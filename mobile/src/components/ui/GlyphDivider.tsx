import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { neon } from '../../theme/neon';

/**
 * A rule across the screen with one big glyph in the middle.
 *
 * Two screens ask for two pets at once and show them as identical chip strips under identical
 * labels: Breed picks a pair, Battle picks a fighter and an opponent. Without a break between
 * the rows the second reads as more of the first, and this says what the pair is for. Breed
 * gets a heart, Battle a `VS`.
 *
 * Magenta both times, which is this app's colour for the relationship between two pets rather
 * than for either one of them.
 *
 * Hidden from screen readers. It says nothing the labels around it do not, and read aloud a
 * decorative glyph is noise at best and "black heart suit" at worst.
 */
export default function GlyphDivider({ glyph }: { glyph: string }) {
    return (
        <View
            style={styles.root}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
        >
            <View style={styles.rule} />
            <Text style={styles.glyph}>{glyph}</Text>
            <View style={styles.rule} />
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    rule: {
        flex: 1,
        height: 1,
        backgroundColor: neon.border,
    },
    glyph: {
        fontSize: 30,
        fontWeight: '800',
        // Android clips a glyph this size against the default line box.
        lineHeight: 40,
        letterSpacing: 1,
        marginHorizontal: 16,
        color: neon.magenta,
        textShadowColor: neon.magenta,
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 14,
    },
});
