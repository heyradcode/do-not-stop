/**
 * The failure mode of a log filter is a pattern that does not match the line it was
 * written for: the red screen keeps appearing and the filter looks installed. So these
 * assert against the message text verbatim, exactly as WalletConnect emitted it.
 */

import { IGNORED_DEV_LOG_PATTERNS } from '../src/devLogFilters';

const isIgnored = (line: string) => IGNORED_DEV_LOG_PATTERNS.some((p) => p.test(line));

describe('dev log filters', () => {
    it('ignores a late session_request with no listener left', () => {
        expect(
            isIgnored(
                '{"context":"client"} Error: emitting session_request: 1786630141078297 without any listeners',
            ),
        ).toBe(true);
    });

    it('covers the other session events that orphan the same way', () => {
        expect(isIgnored('emitting session_ping: 123 without any listeners')).toBe(true);
        expect(isIgnored('emitting session_event: 456 without any listeners')).toBe(true);
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
