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
 *
 * The separator before the id is optional because `engineEvent` in `@walletconnect/utils`
 * builds the name as `${event}${id ? `:${id}` : ''}` — no space. An earlier version of this
 * pattern required `: `, matched nothing, and looked installed the whole time. The id is
 * optional too: the `session_connect` throw site passes none.
 */
export const IGNORED_DEV_LOG_PATTERNS: RegExp[] = [
    /emitting session_\w+:?\s*\d*\s*without any listeners/,
];

/**
 * Whether a `console.error` call is one of the ignored lines.
 *
 * Arguments are joined the way a reader sees them: pino passes the context object and the
 * message as separate arguments, so testing only the first would never match.
 *
 * Exported because this is the decision worth checking. `installDevLogFilters` wraps the
 * console once per process, which makes it awkward to exercise repeatedly.
 */
export const shouldIgnoreConsoleLine = (args: unknown[]): boolean => {
    const text = args.map((arg) => String(arg)).join(' ');
    return IGNORED_DEV_LOG_PATTERNS.some((pattern) => pattern.test(text));
};

/** Fast Refresh re-runs the entry module, and wrapping an already-wrapped console recurses. */
let installed = false;

/**
 * Dev only. `LogBox` does not exist in release builds, and this leaves production logging
 * exactly as it is.
 *
 * Two surfaces, because `LogBox.ignoreLogs` covers only one. It suppresses the red overlay
 * and nothing else, so the same line still reaches Metro and the debugger console, where
 * it reads as an app error and gets reported as one. Filtering `console.error` as well is
 * what actually makes these stop.
 *
 * Everything that does not match a pattern is forwarded untouched, so this narrows what is
 * shown rather than turning logging down. The list is deliberately short: a filter that
 * hides more than it was written for is worse than the noise it removes.
 */
export const installDevLogFilters = (): void => {
    if (!__DEV__ || installed) return;
    installed = true;

    LogBox.ignoreLogs(IGNORED_DEV_LOG_PATTERNS);

    const original = console.error.bind(console);
    console.error = (...args: unknown[]) => {
        if (shouldIgnoreConsoleLine(args)) return;
        original(...args);
    };
};

/*
 * Installed on import, not by the entry module calling it.
 *
 * pino captures `console.error` by reference when the WalletConnect logger is built, and
 * that happens while `./App` is being imported. Since imports are hoisted above the entry
 * module's body, any call there is already too late. Importing this module first is what
 * puts the wrapper in place before anything captures the original.
 */
installDevLogFilters();
