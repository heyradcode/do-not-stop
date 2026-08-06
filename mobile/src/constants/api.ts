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
 * Battle-room notification socket (§J), derived exactly as
 * `frontend/src/config.ts` derives its own. Chain-neutral: backend battles run on
 * both EVM and Solana.
 *
 * `undefined` when `API_URL` is unset, which disables the subscription rather than
 * building `ws:/ws/battle-room` and reconnecting against that forever. A client
 * that never reaches this still converges on the same state by polling
 * `GET /api/battle/:battleId`, so losing it costs latency, never correctness.
 */
export const BATTLE_ROOM_WS_URL = API_URL
    ? `${API_URL.replace(/^http/, 'ws')}/ws/battle-room`
    : undefined;
