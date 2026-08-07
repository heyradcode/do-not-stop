import { defineChannel } from './channel';

/**
 * The per-room, notification-only channel for backend-authoritative battles
 * (docs/battle-protocol.md §J).
 *
 * It replaced a global-broadcast socket that pushed chain-derived data for the on-chain
 * flow, filtered client-side by `(chainId, requestId)`. Broadcasting was acceptable there
 * because anyone could read the same data straight off the chain anyway.
 * Backend-resolved battles carry full combat logs, which is not chain-derived data — a
 * global broadcast would tell every connected client the outcome of every battle as it
 * resolves. So this channel scopes delivery to one room, and carries no battle content at
 * all: only "battleId X changed to state Y, go re-fetch it" (§J's read APIs, Step 27). A
 * client that missed a notification, or was never connected, gets the exact same
 * information by polling those same endpoints — this socket makes that faster, never more
 * authoritative.
 *
 * Membership and the HTTP upgrade are handled by `channel.ts`, which owns the single
 * upgrade listener the process may have; see the note there for why one per channel is
 * not an option.
 */

export interface BattleRoomNotification {
    type: 'battle-updated';
    battleId: string;
    state: string;
}

const channel = defineChannel('/ws/battle-room', 'roomId');

/** Notifies every client watching `roomId`. */
export function notifyBattleRoom(roomId: string, message: BattleRoomNotification): void {
    channel.notify(roomId, message);
}

/** Same as `notifyBattleRoom`, but a no-op when there is no room to notify at all. */
export function notifyBattleRoomIfPresent(
    roomId: string | null,
    message: BattleRoomNotification
): void {
    if (roomId) notifyBattleRoom(roomId, message);
}
