/**
 * The failure mode of a log filter is a pattern that does not match the line it was
 * written for: the red screen keeps appearing and the filter looks installed. So these
 * assert against the message text verbatim, exactly as WalletConnect emitted it.
 */

import {
    IGNORED_DEV_LOG_PATTERNS,
    installDevLogFilters,
    shouldIgnoreConsoleLine,
    shouldIgnoreRejection,
} from '../src/devLogFilters';

const isIgnored = (line: string) => IGNORED_DEV_LOG_PATTERNS.some((p) => p.test(line));

describe('dev log filters', () => {
    it('ignores a late session_request with no listener left', () => {
        expect(
            isIgnored(
                '{"context":"client"} Error: emitting session_request:1786630141078297 without any listeners',
            ),
        ).toBe(true);
    });

    it('covers the other session events that orphan the same way', () => {
        expect(isIgnored('emitting session_ping:123 without any listeners')).toBe(true);
        expect(isIgnored('emitting session_event:456 without any listeners')).toBe(true);
    });

    /*
     * Two throw sites append a number after the message, and one passes no id at all
     * (`session_connect`), so the id and its separator both have to be optional.
     */
    it('covers the throw sites that shape the line differently', () => {
        expect(isIgnored('emitting session_connect without any listeners, 954')).toBe(true);
        expect(isIgnored('emitting session_ping:2176 without any listeners 2176')).toBe(true);
    });

    /*
     * The bug this file exists for, twice over: the pattern originally required a space
     * after the colon and so matched nothing. `engineEvent` in @walletconnect/utils returns
     * `${event}${id ? `:${id}` : ''}`, and the spaced form only ever appeared in the pasted
     * report. Both are accepted rather than betting on which one a reader will hand us.
     */
    it('accepts the separator with or without a space', () => {
        expect(isIgnored('emitting session_request:123 without any listeners')).toBe(true);
        expect(isIgnored('emitting session_request: 123 without any listeners')).toBe(true);
    });

    /*
     * The relay refusing to publish is why sign-in fails. It stays visible: the player
     * gets a toast, and whoever is debugging needs to see that the relay is unhealthy.
     */
    it('does not hide a failed publish', () => {
        expect(
            isIgnored(
                '{"context":"client"} Failed to publish payload, please try again. id: 1786629317758309888 tag:1108',
            ),
        ).toBe(false);
    });

    it('does not hide anything from our own code', () => {
        expect(isIgnored('Signing failed: UnknownRpcError: An unknown RPC error occurred.')).toBe(
            false,
        );
        expect(isIgnored('[pet-action] mutation error: BattleRejectionError')).toBe(false);
    });
});


/**
 * `LogBox.ignoreLogs` hides the red overlay and nothing else. The same line still reaches
 * Metro and the debugger console, where it reads as an app error and gets reported as one.
 * That is why the first version of this filter was installed correctly and the message
 * kept appearing: only one of the two surfaces was covered.
 */
describe('shouldIgnoreConsoleLine', () => {
    it('matches the line as a reader sees it, across separate arguments', () => {
        // pino passes the context object and the message separately, so testing only the
        // first argument would never match the thing this exists for.
        expect(
            shouldIgnoreConsoleLine([
                '{"context":"client"}',
                'Error: emitting session_request:1786660970108296 without any listeners',
            ]),
        ).toBe(true);
    });

    it('matches a single pre-joined argument too', () => {
        expect(
            shouldIgnoreConsoleLine([
                '{"context":"client"} Error: emitting session_request:123 without any listeners',
            ]),
        ).toBe(true);
    });

    /*
     * Reproduces the arguments as they actually arrive, rather than as the red box renders
     * them. `@walletconnect/sign-client` throws inside `onRelayMessage`, catches it, and
     * calls `this.client.logger.error(err)`, so pino hands console.error the child logger's
     * bindings object and a real Error — not the string in the bug report. Passing a string
     * here is what let the broken pattern look correct.
     */
    it('matches the arguments WalletConnect actually passes', () => {
        const id = 1786660970108296;
        const thrown = new Error(`emitting ${`session_request:${id}`} without any listeners`);

        expect(shouldIgnoreConsoleLine([{ context: 'client' }, thrown])).toBe(true);
    });

    it('leaves a failed publish alone', () => {
        expect(
            shouldIgnoreConsoleLine(['Failed to publish payload, please try again. tag:1108']),
        ).toBe(false);
    });

    it('leaves our own logs alone', () => {
        expect(shouldIgnoreConsoleLine(['[pet-action] mutation error:', new Error('boom')])).toBe(
            false,
        );
        expect(shouldIgnoreConsoleLine(['[sign-in]', new Error('relay down')])).toBe(false);
    });

    it('survives a non-string argument', () => {
        expect(shouldIgnoreConsoleLine([undefined, null, 42, { a: 1 }])).toBe(false);
    });
});

/**
 * A different surface from the two above: React Native reports unhandled rejections through
 * `ExceptionsManager.handleException`, so neither `LogBox.ignoreLogs` nor the `console.error`
 * wrapper sees them.
 *
 * The one being filtered is `@reown/appkit-wagmi-react-native` calling an async
 * `connectWagmi` without awaiting it, inside a `try/catch` that therefore catches nothing.
 * On restart with a session that has no accounts left, it surfaces as a startup crash for a
 * failure whose outcome — stay disconnected, offer Connect — is already correct and visible.
 */
describe('shouldIgnoreRejection', () => {
    /** How viem builds it: the detail line lives in `message`. */
    const appKitRejection = () => {
        const error = new Error(
            'User rejected the request.\n\nDetails: No accounts found or user rejected connection via AppKit.\nVersion: viem@2.38.4',
        );
        error.name = 'UserRejectedRequestError';
        return error;
    };

    it('ignores the unawaited AppKit connect from app startup', () => {
        expect(shouldIgnoreRejection(appKitRejection())).toBe(true);
    });

    /*
     * The case that keeps this filter honest. Refusing a transaction in the wallet throws
     * the same error class with the same first line, and that one is the player's own
     * action — it has to keep surfacing.
     */
    it('does not ignore a wallet refusing a transaction', () => {
        const error = new Error(
            'User rejected the request.\n\nRequest Arguments:\n  from: 0xEb43\n  to: 0x4B89\nVersion: viem@2.38.4',
        );
        error.name = 'UserRejectedRequestError';
        expect(shouldIgnoreRejection(error)).toBe(false);
    });

    it('does not ignore anything from our own code', () => {
        expect(shouldIgnoreRejection(new Error('BattleRejectionError: not on record yet'))).toBe(
            false,
        );
    });

    it('survives a rejection that is not an Error', () => {
        expect(shouldIgnoreRejection(undefined)).toBe(false);
        expect(shouldIgnoreRejection('No accounts found or user rejected connection via AppKit')).toBe(
            true,
        );
    });
});

describe('installDevLogFilters', () => {
    it('installs once, so Fast Refresh cannot wrap an already-wrapped console', () => {
        const before = console.error;
        installDevLogFilters();
        const afterFirst = console.error;
        installDevLogFilters();

        expect(console.error).toBe(afterFirst);
        console.error = before;
    });
});

/**
 * The ordering is the whole fix, and it is invisible at runtime until someone reports the
 * noise again.
 *
 * pino captures `console.error` by reference when the WalletConnect logger is created, and
 * that happens while `./App` is imported. `import` statements are hoisted above the entry
 * module's body, so a wrapper installed by a call in that body is always too late. The
 * first version did exactly that: correct filter, correctly registered, never consulted.
 */
describe('entry module ordering', () => {
    const entry = require('fs').readFileSync(
        require('path').join(__dirname, '..', 'index.js'),
        'utf8',
    );

    it('imports the log filters before anything that builds a logger', () => {
        const filters = entry.indexOf("'./src/devLogFilters'");
        const app = entry.indexOf("'./App'");

        expect(filters).toBeGreaterThan(-1);
        expect(app).toBeGreaterThan(-1);
        expect(filters).toBeLessThan(app);
    });

    it('installs by importing, not by a call in the module body', () => {
        // A call below the imports runs after every import has already been evaluated.
        expect(entry).not.toMatch(/^\s*installDevLogFilters\(\);/m);
    });
});
