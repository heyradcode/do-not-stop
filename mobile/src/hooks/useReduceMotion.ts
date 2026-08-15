import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Whether the OS has been asked to cut animation down.
 *
 * The listener is not optional padding around the initial read: the setting can be turned on
 * while the app is running, and without it a player who does that keeps every animation until
 * the next cold start. The initial read is a promise that never resolves when the native
 * module is absent, which leaves this `false` — the right default, since the OS not answering
 * is not a request for reduced motion.
 */
export function useReduceMotion(): boolean {
    const [reduced, setReduced] = useState(false);

    useEffect(() => {
        let alive = true;
        AccessibilityInfo.isReduceMotionEnabled().then((value) => {
            if (alive) {
                setReduced(value);
            }
        });
        const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
        return () => {
            alive = false;
            subscription.remove();
        };
    }, []);

    return reduced;
}
