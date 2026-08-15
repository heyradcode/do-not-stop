import React, { createContext, useContext, useMemo } from 'react';
import {
    PanResponder,
    StyleSheet,
    View,
    type GestureResponderEvent,
    type PanResponderGestureState,
} from 'react-native';

import { usePanelTransition, type PanelTransition } from '../hooks/usePanelTransition';

/**
 * How far in from the left edge a drag has to start to count as reaching for the drawer.
 *
 * Narrow on purpose. Everything inside this strip is taken away from whatever is underneath,
 * and what is underneath on two screens is a horizontal pager, so a generous edge would make
 * the first swipe of a pet gallery open the menu instead.
 */
const EDGE_WIDTH = 24;

/**
 * How far a drag has to travel to count, in either direction. "A little", but more than a
 * thumb resting on the bezel or the wobble in a tap.
 */
const SWIPE_THRESHOLD = 12;

/**
 * How much more horizontal than vertical the drag has to be.
 *
 * Without this, a vertical scroll that starts near the edge and wanders right by 12px opens
 * the drawer mid-scroll. Every screen here scrolls vertically, so that is the common case,
 * not the rare one.
 */
const HORIZONTAL_BIAS = 2;

/**
 * Whether a drag is a reach for the drawer.
 *
 * Exported and pure so it can be checked directly. Driving it through `PanResponder` in a
 * test means synthesising a touch history for RN to derive a gesture state from, which tests
 * RN rather than this rule.
 */
export const shouldOpenFromEdge = (
    event: GestureResponderEvent,
    gesture: PanResponderGestureState,
): boolean => {
    // Where the finger went down. `gesture.x0` is only meaningful once the responder has been
    // granted, which is the thing being decided here.
    const startX = event.nativeEvent.pageX - gesture.dx;
    if (startX > EDGE_WIDTH) {
        return false;
    }
    return gesture.dx > SWIPE_THRESHOLD && gesture.dx > Math.abs(gesture.dy) * HORIZONTAL_BIAS;
};

/**
 * Whether a drag on the open drawer is a push to send it back.
 *
 * The mirror of `shouldOpenFromEdge`, and it has to be a separate responder rather than the
 * same one reading the open state: the drawer is a `Modal`, which is its own native window,
 * so the host's surface is behind it and never sees the touch. This one lives on the panel.
 *
 * No edge test, because the panel is the surface being pushed and the whole of it should
 * answer. The direction and the horizontal bias still apply.
 */
export const shouldCloseFromDrag = (
    _event: GestureResponderEvent,
    gesture: PanResponderGestureState,
): boolean =>
    gesture.dx < -SWIPE_THRESHOLD && -gesture.dx > Math.abs(gesture.dy) * HORIZONTAL_BIAS;

const DrawerContext = createContext<PanelTransition | null>(null);

/**
 * The drawer's open state, for the two things that open it: the header button and the edge
 * swipe. It lived inside `AppDrawer` while the button was the only way in.
 */
export const useDrawer = (): PanelTransition => {
    const drawer = useContext(DrawerContext);
    if (!drawer) {
        throw new Error('useDrawer must be used inside DrawerHost');
    }
    return drawer;
};

/**
 * Owns the drawer's open state and the edge swipe that opens it, for everything it wraps.
 *
 * The gesture is claimed in the **capture** phase, which is the only way it can win against a
 * child that also wants horizontal drags. `Carousel` is exactly that child, so the predicate
 * has to be strict enough to be wrong rarely: the drag must start within `EDGE_WIDTH` of the
 * left edge, travel `OPEN_THRESHOLD` to the right, and be `HORIZONTAL_BIAS` times more
 * horizontal than vertical. Fail any one and the touch is left alone, so taps and scrolls
 * that begin near the edge behave as they always did.
 *
 * Opening on grant rather than on release is deliberate: the drawer is meant to answer a
 * small movement, and waiting for the finger to lift makes a swipe feel like a tap.
 */
export default function DrawerHost({ children }: { children: React.ReactNode }) {
    const drawer = usePanelTransition();
    const { open } = drawer;

    const responder = useMemo(
        () =>
            PanResponder.create({
                onMoveShouldSetPanResponderCapture: shouldOpenFromEdge,
                onPanResponderGrant: open,
            }),
        [open],
    );

    return (
        <DrawerContext.Provider value={drawer}>
            <View style={styles.root} {...responder.panHandlers}>
                {children}
            </View>
        </DrawerContext.Provider>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
    },
});
