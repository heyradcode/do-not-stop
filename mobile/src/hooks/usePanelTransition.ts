import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';

import { useReduceMotion } from './useReduceMotion';

export interface PanelTransition {
    /** Whether the Modal should be mounted. Stays true through the closing animation. */
    isVisible: boolean;
    /** 0 closed, 1 open. Drive every transform off this so they cannot drift apart. */
    progress: Animated.Value;
    open: () => void;
    close: () => void;
    /** Exposed because a panel's trigger usually has press feedback of its own to suppress. */
    reduceMotion: boolean;
}

const CLOSE_MS = 120;

/**
 * The open/close half of an overlay that animates itself in and out, without saying what the
 * animation looks like. `AccountSheet` fades and drops; `AppDrawer` slides in from the left.
 *
 * `isVisible` mounts the Modal and `progress` drives what is inside it. They are separate
 * because a close has to outlive the state change: the panel is still animating out at the
 * moment `isVisible` would already be false, so it stays true until the animation calls back.
 *
 * Both callers set the Modal to `animationType="none"` for the same reason this exists. RN's
 * own animation applies to the whole window, backdrop included, so a panel could only ever
 * cross-fade in flat; driving it here lets it come from somewhere.
 *
 * Reduced motion skips the wait as well as the movement — the close animation is a 120ms
 * delay before the panel goes, and honouring the setting means it goes now.
 */
export function usePanelTransition(): PanelTransition {
    const [isVisible, setIsVisible] = useState(false);
    const reduceMotion = useReduceMotion();
    const progress = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (!isVisible) {
            return;
        }
        if (reduceMotion) {
            progress.setValue(1);
            return;
        }
        // Reset rather than trusting the close to have finished: an unmount mid-close leaves
        // the value part-way, and the panel would then open from wherever it stopped.
        progress.setValue(0);
        Animated.spring(progress, {
            toValue: 1,
            useNativeDriver: true,
            stiffness: 260,
            damping: 22,
            mass: 0.7,
        }).start();
    }, [isVisible, reduceMotion, progress]);

    const close = useCallback(() => {
        if (reduceMotion) {
            setIsVisible(false);
            return;
        }
        Animated.timing(progress, {
            toValue: 0,
            duration: CLOSE_MS,
            useNativeDriver: true,
        }).start(() => setIsVisible(false));
    }, [reduceMotion, progress]);

    const open = useCallback(() => setIsVisible(true), []);

    return { isVisible, progress, open, close, reduceMotion };
}
