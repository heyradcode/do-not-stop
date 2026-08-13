import { LogBox } from 'react-native';

/**
 * WalletConnect log lines that are library-internal bookkeeping, not app faults.
 *
 * Its pino logger writes these at level 50, so React Native's LogBox renders them as
 * full-screen "Console Error" overlays indistinguishable from a real crash in our code.
 *
 * Only the genuinely non-actionable ones are listed. A late `session_request` response is
 * the clearest case: the request already failed, the promise already settled and its
 * listener was already removed, so the response arrives with nowhere to go. The failure
 * that matters was the publish, and `SignInErrorReporter` tells the player about that one.
 *
 * Publish and connection failures are deliberately NOT here. They mean something, and
 * hiding them would remove the signal that the relay is unhealthy.
 */
export const IGNORED_DEV_LOG_PATTERNS: RegExp[] = [
    /emitting session_\w+: \d+ without any listeners/,
];

/**
 * Dev-only, and overlay-only: `LogBox` does not exist in release builds, and ignoring a
 * pattern hides the red screen without touching `console`. The lines still appear in the
 * Metro output, so nothing becomes unobservable — it stops being mistaken for our bug.
 */
export const installDevLogFilters = (): void => {
    if (!__DEV__) return;
    LogBox.ignoreLogs(IGNORED_DEV_LOG_PATTERNS);
};
