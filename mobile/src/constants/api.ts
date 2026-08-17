import { API_URL } from '@env';

/**
 * Backend endpoints derived from `API_URL`.
 *
 * Separate from the root `config.ts` on purpose. That module is the app's
 * bootstrap: importing it runs `setStorageAdapter`, `setEvidenceStore` and the
 * AsyncStorage native module, so a hook that pulled a constant from it would drag
 * all of that along and fail outright under jest, which has no native modules.
 * Constants belong somewhere with no side effects to import.
 */

/**
 * A backend WebSocket endpoint, derived exactly as `frontend/src/config.ts` derives its
 * own: swap the `http` scheme for `ws` and append the channel's path.
 *
 * Takes the base URL as an argument rather than reading `@env` itself, for the reason
 * `ethereumNetworks`' `resolveTargetChainId` does the same. `react-native-dotenv` inlines
 * `@env` at Babel transform time, so `API_URL` is a literal baked in from whichever `.env`
 * the machine running the build happened to have. A test asserting on a constant derived
 * straight from it is testing that file, not this rule, and passes or fails on whether the
 * machine has one at all: `mobile/.env` is gitignored, so CI has none and every such
 * assertion reads `undefined` there while passing locally.
 *
 * `undefined` when the base URL is unset, which disables the subscription rather than
 * building `ws:/ws/battle-room` and reconnecting against that forever.
 */
export const socketUrlFrom = (baseUrl: string | undefined, path: string): string | undefined =>
    baseUrl ? `${baseUrl.replace(/^http/, 'ws')}${path}` : undefined;

/**
 * Battle-room notification socket (§J). Chain-neutral: backend battles run on both EVM
 * and Solana.
 *
 * A client that never reaches this still converges on the same state by polling
 * `GET /api/battle/:battleId`, so losing it costs latency, never correctness.
 */
export const BATTLE_ROOM_WS_URL = socketUrlFrom(API_URL, '/ws/battle-room');

/**
 * Private chat's notification channel, derived the same way.
 *
 * Unlike the battle room this one is authenticated: `useChatThreadSocket` offers the JWT
 * as a WebSocket subprotocol, and the server refuses the upgrade without one. That is why
 * a thread is readable but not live when this is unset — every read is authorized again
 * server-side, so losing the socket costs freshness, never access.
 */
export const CHAT_WS_URL = socketUrlFrom(API_URL, '/ws/chat');
