import { useEffect, useRef, useState } from 'react';
import { getStorageAdapter } from '../../api';

/**
 * Subscribes to one thread's channel (`/ws/chat`).
 *
 * Carries no message text: a frame says the thread changed, or who is currently
 * connected. Every notification means one thing — re-read the thread.
 *
 * The connection is authenticated. The token is offered as a WebSocket subprotocol
 * because browsers cannot set headers on a WebSocket and a token in the query string
 * would be recorded by proxies and access logs. Without a valid token for a thread the
 * caller participates in, the server refuses the upgrade, so this reports "not live"
 * rather than silently subscribing to nothing.
 *
 * Same reconnect shape as `useBattleRoomSocket`, including the reconnect callback:
 * anything sent while the socket was down was never delivered, so a reconnect is as much
 * a reason to re-read as a frame is.
 */

export interface ChatThreadNotification {
    /**
     * `thread-updated` is a new message; `thread-read` a moved read watermark;
     * `thread-reacted` a reaction added, changed or removed.
     */
    type: 'thread-updated' | 'thread-read' | 'thread-reacted';
    threadId: string;
    messageId: number;
}

export interface ChatPresence {
    type: 'presence';
    topic: string;
    online: string[];
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

export interface UseChatThreadSocketResult {
    connected: boolean;
    /** Wallet addresses currently connected to this thread, including your own. */
    online: string[];
}

const INITIAL_RETRY_MS = 1000;
const MAX_RETRY_MS = 30_000;

/** Marker subprotocol the server echoes back; the token follows it. */
const AUTH_PROTOCOL = 'cryptopets-auth';

export function useChatThreadSocket(
    options: UseChatThreadSocketOptions
): UseChatThreadSocketResult {
    const { url, threadId } = options;
    const [connected, setConnected] = useState(false);
    const [online, setOnline] = useState<string[]>([]);

    // Refs so inline callbacks do not rebuild the socket every render: its lifetime should
    // depend on the url and thread, and nothing else.
    const onNotification = useRef(options.onNotification);
    const onReconnect = useRef(options.onReconnect);
    onNotification.current = options.onNotification;
    onReconnect.current = options.onReconnect;

    useEffect(() => {
        setConnected(false);
        setOnline([]);
        if (!url || !threadId) return;

        let disposed = false;
        let socket: WebSocket | null = null;
        let retryTimer: ReturnType<typeof setTimeout> | null = null;
        let retryDelay = INITIAL_RETRY_MS;
        let hasConnectedBefore = false;

        const connect = async (): Promise<void> => {
            if (disposed) return;

            // Read per attempt rather than once: a reconnect after a token refresh must
            // use the new one, or it authenticates with a token the server has retired.
            const token = await getStorageAdapter()?.getToken();
            if (disposed) return;
            if (!token) {
                // Nothing to authenticate with. Retry rather than give up: this happens
                // during sign-in, and the thread becomes live once a token exists.
                retryTimer = setTimeout(() => void connect(), retryDelay);
                retryDelay = Math.min(retryDelay * 2, MAX_RETRY_MS);
                return;
            }

            socket = new WebSocket(`${url}?threadId=${encodeURIComponent(threadId)}`, [
                AUTH_PROTOCOL,
                token,
            ]);

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
                    const message = JSON.parse(event.data as string) as
                        | ChatThreadNotification
                        | ChatPresence;
                    if (message?.type === 'presence' && Array.isArray(message.online)) {
                        setOnline(message.online);
                    } else if (
                        (message?.type === 'thread-updated' ||
                            message?.type === 'thread-read' ||
                            message?.type === 'thread-reacted') &&
                        typeof message.threadId === 'string'
                    ) {
                        onNotification.current?.(message as ChatThreadNotification);
                    }
                } catch {
                    // A malformed frame is not worth surfacing: the read endpoint is the
                    // truth, and the next read picks up whatever this would have announced.
                }
            };

            socket.onclose = () => {
                if (disposed) return;
                setConnected(false);
                setOnline([]);
                retryTimer = setTimeout(() => void connect(), retryDelay);
                retryDelay = Math.min(retryDelay * 2, MAX_RETRY_MS);
            };

            socket.onerror = () => {
                // `onclose` always follows and owns reconnection; retrying here too would
                // open two sockets for one failure.
                socket?.close();
            };
        };

        void connect();

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
            setOnline([]);
        };
    }, [url, threadId]);

    return { connected, online };
}
