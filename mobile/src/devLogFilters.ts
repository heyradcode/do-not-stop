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

/**
 * Unhandled promise rejections that are a library's own missing `await`, not an app fault.
 *
 * Only one so far, and it is worth naming precisely.
 * `@reown/appkit-wagmi-react-native/src/adapter.ts` syncs wagmi to the restored AppKit
 * connector during `init`:
 *
 *     try {
 *       connectWagmi(this.wagmiConfig, { connector: connectorInstance });
 *     } catch (error) { ... }
 *
 * `connectWagmi` is async and is not awaited, so that `catch` can never run — the rejection
 * escapes the try block entirely. When the app restarts with a WalletConnect session that
 * has no accounts left, `UniversalConnector.connect` throws
 * `UserRejectedRequestError('No accounts found or user rejected connection via AppKit.')`
 * and it lands as an uncaught rejection at startup.
 *
 * The outcome it reports is already correct and already visible: the connect fails, wagmi
 * stays disconnected, and the UI offers Connect. Nothing is being swallowed except the
 * claim that the app crashed.
 *
 * wagmi's own reconnect path is unaffected — it catches (`.connect({ isReconnecting: true })
 * .catch(() => null)`), so restoring a live session still works.
 */
export const IGNORED_UNHANDLED_REJECTIONS: RegExp[] = [
    /No accounts found or user rejected connection via AppKit/,
];

/**
 * Whether an unhandled rejection is one of the above.
 *
 * Deliberately narrow: it matches the AppKit connection message, not `UserRejectedRequestError`
 * in general. Refusing a transaction in the wallet produces the same error class, and that
 * one has to keep surfacing.
 */
export const shouldIgnoreRejection = (rejection: unknown): boolean => {
    const text =
        rejection instanceof Error ? `${rejection.name}: ${rejection.message}` : String(rejection);
    return IGNORED_UNHANDLED_REJECTIONS.some((pattern) => pattern.test(text));
};

/**
 * Filter unhandled rejections without changing how any other one is reported.
 *
 * React Native routes these through `ExceptionsManager.handleException`, not `console.error`,
 * which is why the console wrapper below cannot see them. Its tracker is re-enterable
 * (`enable` calls `disable` first), so re-enabling with RN's own options and one extra guard
 * replaces the handler cleanly and keeps RN's formatting for everything else.
 *
 * Only ever consulted for rejections nobody handled. An error the app awaits and surfaces
 * never reaches here, so this cannot hide a failure the UI was going to report.
 *
 * Guarded because both requires are RN internals. If they move in a future version the
 * right outcome is the noise coming back, not rejection reporting disappearing.
 *
 * The deep import is deliberate and has no top-level equivalent: React Native does not
 * re-export `promiseRejectionTrackingOptions`, and reaching it is what lets RN keep
 * formatting and reporting every rejection we do not filter. Writing our own handler
 * instead would mean reimplementing that formatting against `ExceptionsManager`, which is
 * a deeper import for a worse result.
 */
const installRejectionFilter = (): void => {
    try {
        const tracking = require('promise/setimmediate/rejection-tracking');
        // eslint-disable-next-line @react-native/no-deep-imports
        const options = require('react-native/Libraries/promiseRejectionTrackingOptions').default;

        tracking.enable({
            ...options,
            onUnhandled: (id: number, rejection: unknown) => {
                if (shouldIgnoreRejection(rejection)) return;
                options.onUnhandled(id, rejection);
            },
        });
    } catch {
        /* RN internals moved; leave rejection reporting exactly as it was. */
    }
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

    // Third surface: unhandled rejections do not pass through either of the two above.
    installRejectionFilter();
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
