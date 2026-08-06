import { useEffect, useRef, useState } from 'react';

/**
 * Subscribes to one thread's notification channel (`/ws/chat`).
 *
 * Notification only, by construction: a frame carries `{ threadId, messageId }` and no
 * text, so there is nothing here that could be rendered as a message even by mistake.
 * Every frame means one thing — re-read the thread.
 *
 * Same shape as `useBattleRoomSocket`, including the reconnect callback, which matters
 * for the same reason: anything sent while the socket was down was never delivered, so a
 * reconnect is as much a reason to re-read as a frame is. Kept separate rather than
 * generalized because the two channels differ in what they will need next — this one
 * gains authentication when chat widens past married pairs.
 */

export interface ChatThreadNotification {
    type: 'thread-updated';
    threadId: string;
    messageId: number;
}

export interface UseChatThreadSocketOptions {
    /** Socket endpoint. Undefined disables the subscription entirely. */
    url: string | undefined;
    /** Thread to watch. Null disables the subscription. */
    threadId: string | null;
    onNotification?: (message: ChatThreadNotification) => void;
    /** Fired after a reconnect, never on the first connect. */
    onReconnect?: () => void;
}

const INITIAL_RETRY_MS = 1000;
const MAX_RETRY_MS = 30_000;

export function useChatThreadSocket(options: UseChatThreadSocketOptions): { connected: boolean } {
    const { url, threadId } = options;
    const [connected, setConnected] = useState(false);

    // Refs so inline callbacks do not rebuild the socket every render: its lifetime should
    // depend on the url and thread, and nothing else.
    const onNotification = useRef(options.onNotification);
    const onReconnect = useRef(options.onReconnect);
    onNotification.current = options.onNotification;
    onReconnect.current = options.onReconnect;

    useEffect(() => {
        setConnected(false);
        if (!url || !threadId) return;

        let disposed = false;
        let socket: WebSocket | null = null;
        let retryTimer: ReturnType<typeof setTimeout> | null = null;
        let retryDelay = INITIAL_RETRY_MS;
        let hasConnectedBefore = false;

        const connect = (): void => {
            if (disposed) return;

            socket = new WebSocket(`${url}?threadId=${encodeURIComponent(threadId)}`);

            socket.onopen = () => {
                if (disposed) return;
                setConnected(true);
                retryDelay = INITIAL_RETRY_MS;
                if (hasConnectedBefore) {
                    onReconnect.current?.();
                }
                hasConnectedBefore = true;
            };

            socket.onmessage = (event) => {
                if (disposed) return;
                try {
                    const message = JSON.parse(event.data as string) as ChatThreadNotification;
                    if (message?.type === 'thread-updated' && typeof message.threadId === 'string') {
                        onNotification.current?.(message);
                    }
                } catch {
                    // A malformed frame is not worth surfacing: the read endpoint is the
                    // truth, and the next read picks up whatever this would have announced.
                }
            };

            socket.onclose = () => {
                if (disposed) return;
                setConnected(false);
                retryTimer = setTimeout(connect, retryDelay);
                retryDelay = Math.min(retryDelay * 2, MAX_RETRY_MS);
            };

            socket.onerror = () => {
                // `onclose` always follows and owns reconnection; retrying here too would
                // open two sockets for one failure.
                socket?.close();
            };
        };

        connect();

        return () => {
            disposed = true;
            if (retryTimer) clearTimeout(retryTimer);
            // Detached before closing so this teardown cannot schedule a retry for a
            // subscription that is going away.
            if (socket) {
                socket.onopen = null;
                socket.onmessage = null;
                socket.onclose = null;
                socket.onerror = null;
                socket.close();
            }
            setConnected(false);
        };
    }, [url, threadId]);

    return { connected };
}
