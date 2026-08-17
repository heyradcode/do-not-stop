/**
 * How a backend WebSocket URL is derived from `API_URL`.
 *
 * Tested through `socketUrlFrom` rather than through `BATTLE_ROOM_WS_URL` and
 * `CHAT_WS_URL` themselves, for the reason `ethereumNetworks.test.ts` records about
 * `resolveTargetChainId`: `react-native-dotenv` inlines `@env` at Babel transform time, so
 * those two constants are literals baked in from whichever `.env` built them. `mobile/.env`
 * is gitignored, so a machine with one and CI without it disagree about their value, and an
 * assertion on either tests the file rather than the rule.
 *
 * That is not hypothetical. `BattleScreen.test.tsx` matched `roomSocketUrl` against
 * `/^wss?:\/\/.+\/ws\/battle-room$/`, which passed on every developer machine and failed on
 * CI with `undefined`, where the app has no backend configured at all.
 */

import { socketUrlFrom } from '../src/constants/api';

describe('socketUrlFrom', () => {
    it('swaps http for ws and appends the channel path', () => {
        expect(socketUrlFrom('http://localhost:4000', '/ws/battle-room')).toBe(
            'ws://localhost:4000/ws/battle-room',
        );
    });

    it('keeps a TLS endpoint secure', () => {
        // `ws://` against an `https://` backend is refused by the browser and by App
        // Transport Security on iOS, so the scheme has to carry the `s` across.
        expect(socketUrlFrom('https://api.cryptopets.app', '/ws/chat')).toBe(
            'wss://api.cryptopets.app/ws/chat',
        );
    });

    it('leaves a host containing "http" alone when the scheme is not http', () => {
        // What the `^` anchor is for. `API_URL` is always http(s) today, so this input
        // cannot arrive from `@env` and the anchor is defensive rather than load-bearing.
        // It is pinned anyway because dropping the anchor reads as a harmless
        // simplification: on a base that does start with http the two forms agree
        // exactly, so nothing else in this file can tell them apart.
        expect(socketUrlFrom('wss://http-proxy.internal', '/ws/chat')).toBe(
            'wss://http-proxy.internal/ws/chat',
        );
    });

    it('is undefined with no backend configured, rather than a bad URL', () => {
        // This is the CI case. Returning `ws:/ws/battle-room` here would have the socket
        // hook reconnecting against a nonsense address forever; undefined disables the
        // subscription and leaves polling to carry the battle.
        expect(socketUrlFrom(undefined, '/ws/battle-room')).toBeUndefined();
        expect(socketUrlFrom('', '/ws/battle-room')).toBeUndefined();
    });
});
