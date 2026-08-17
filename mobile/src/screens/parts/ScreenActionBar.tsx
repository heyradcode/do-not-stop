import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { neon } from '../../theme/neon';

/**
 * The pinned strip a screen's primary action lives in. A sibling of the screen's
 * `ScrollView`, never a child of it.
 *
 * Rendered inside the scroll after the content, a button's position tracked the height of
 * whatever the screen put above it: different on every screen, and below the fold on the
 * longer ones. Battle in particular put Start Battle under a pet picker, an opponent list of
 * up to twenty rows, and a replay animation.
 *
 * Deliberately children-only. `ActionScreenLayout` supplies a whole action row, Battle and
 * Marriage supply their own buttons in their own accent colours, and a component that tried
 * to own the buttons would need a prop per difference. What every screen shares is where the
 * strip sits and how it clears the system chrome, which is all that is here.
 *
 * Children must not carry vertical margins: `gap` sets the spacing, so a child with its own
 * `marginTop` gets both and the rows space unevenly depending on which are showing.
 */
export default function ScreenActionBar({ children }: { children: React.ReactNode }) {
    const insets = useSafeAreaInsets();

    return (
        // `paddingBottom` rather than a fixed height: the strip sits above the home indicator
        // on iOS and the gesture bar on Android, and both vary by device.
        <View testID="action-bar" style={[styles.bar, { paddingBottom: insets.bottom + 12 }]}>
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    /**
     * Carries its own background: the scroll passes underneath, so a transparent strip would
     * show content sliding behind the buttons.
     */
    bar: {
        paddingHorizontal: 16,
        paddingTop: 12,
        backgroundColor: neon.bgDeep,
        borderTopWidth: 1,
        borderTopColor: neon.border,
        gap: 10,
    },
});
