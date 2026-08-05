import { useEffect, useRef, useState } from 'react';

/**
 * Subscribes to the per-room battle notification channel (`/ws/battle-room`, §J).
 *
 * Notification only, by construction: the messages carry `{ battleId, state }` and nothing
 * else, so there is no battle content here that could be trusted over the read APIs even by
 * mistake. Every message means one thing — go re-fetch.
 *
 * Reconnects with backoff, and reports each successful reconnect separately from each
 * message. A caller needs both: a reconnect means "you may have missed something while the
 * socket was down", which is exactly as much a reason to re-read as a message is.
 */

export interface BattleRoomNotification {
    type: 'battle-updated';
    battleId: string;
    state: string;
}

export interface UseBattleRoomSocketOptions {
    /** Socket endpoint. Undefined disables the subscription entirely. */
    url: string | undefined;
    /** Room to join. Null disables the subscription. */
    roomId: string | null;
    onNotification?: (message: BattleRoomNotification) => void;
    /** Fired after a reconnect, never on the first connect. */
    onReconnect?: () => void;
}

const INITIAL_RETRY_MS = 1000;
const MAX_RETRY_MS = 30_000;

export function useBattleRoomSocket(options: UseBattleRoomSocketOptions): { connected: boolean } {
    const { url, roomId } = options;
    const [connected, setConnected] = useState(false);

    // Held in refs so a caller passing inline closures does not tear down and rebuild the
    // socket on every render. The connection's lifetime should depend on the url and room,
    // and nothing else.
    const onNotification = useRef(options.onNotification);
    const onReconnect = useRef(options.onReconnect);
    onNotification.current = options.onNotification;
    onReconnect.current = options.onReconnect;

    useEffect(() => {
        setConnected(false);
        if (!url || !roomId) return;

        let disposed = false;
        let socket: WebSocket | null = null;
        let retryTimer: ReturnType<typeof setTimeout> | null = null;
        let retryDelay = INITIAL_RETRY_MS;
        let hasConnectedBefore = false;

        const connect = (): void => {
            if (disposed) return;

            socket = new WebSocket(`${url}?roomId=${encodeURIComponent(roomId)}`);

            socket.onopen = () => {
                if (disposed) return;
                setConnected(true);
                retryDelay = INITIAL_RETRY_MS;
                if (hasConnectedBefore) {
                    // Whatever happened while this was down was never delivered, so the
                    // caller has to re-read rather than assume continuity.
                    onReconnect.current?.();
                }
                hasConnectedBefore = true;
            };

            socket.onmessage = (event) => {
                if (disposed) return;
                try {
                    const message = JSON.parse(event.data as string) as BattleRoomNotification;
                    if (message?.type === 'battle-updated' && typeof message.battleId === 'string') {
                        onNotification.current?.(message);
                    }
                } catch {
                    // A malformed frame is not worth surfacing: the read APIs are still the
                    // truth, and polling will pick up whatever this would have announced.
                }
            };

            socket.onclose = () => {
                if (disposed) return;
                setConnected(false);
                retryTimer = setTimeout(connect, retryDelay);
                // Backoff, capped: a backend that is down for an hour should not be met with
                // a reconnect every second, but a client should still recover on its own.
                retryDelay = Math.min(retryDelay * 2, MAX_RETRY_MS);
            };

            socket.onerror = () => {
                // `onclose` always follows, and that is where reconnection is handled. Doing
                // it here too would open two sockets for one failure.
                socket?.close();
            };
        };

        connect();

        return () => {
            disposed = true;
            if (retryTimer) clearTimeout(retryTimer);
            // Detached first: a close triggered by this cleanup must not schedule a retry
            // for a subscription that is going away.
            if (socket) {
                socket.onopen = null;
                socket.onmessage = null;
                socket.onclose = null;
                socket.onerror = null;
                socket.close();
            }
            setConnected(false);
        };
    }, [url, roomId]);

    return { connected };
}
