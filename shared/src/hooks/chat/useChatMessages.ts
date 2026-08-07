import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '../../contexts/ApiClientContext';
import { useAuth } from '../../contexts/AuthContext';
import { useChatThreadSocket, type ChatThreadNotification } from './useChatThreadSocket';

export interface ChatMessage {
    id: number;
    /** Author's wallet address. Compare against your own to decide which side to render. */
    sender: string;
    text: string;
    createdAt: string;
}

export interface UseChatMessagesOptions {
    threadId: string | null;
    /** `/ws/chat` endpoint. Undefined leaves the thread poll-free but not live. */
    socketUrl?: string;
}

/** A page as the server returns it: the messages, plus how far the other side has read. */
interface ChatPage {
    messages: ChatMessage[];
    readUpTo: number;
}

export interface UseChatMessagesResult {
    messages: ChatMessage[];
    /**
     * Newest message id the counterpart has read; 0 if none.
     *
     * One number for the whole thread rather than a flag per message: read state is a
     * watermark, so `message.id <= readUpTo` answers it for every message at once.
     */
    readUpTo: number;
    /** Moves the caller's own watermark, so the sender's receipt fills in. */
    markRead: (messageId: number) => void;
    isLoading: boolean;
    error: Error | null;
    /** True while the notification channel is connected; false means reads are on demand only. */
    isLive: boolean;
    /** Wallet addresses currently connected to this thread, including your own. */
    online: string[];
    send: (text: string) => Promise<void>;
    isSending: boolean;
    sendError: Error | null;
}

export const chatMessagesQueryKey = (baseURL: string, threadId: string | null) => [
    'chatMessages',
    baseURL,
    threadId,
];

/**
 * One thread's messages, kept current by the notification channel.
 *
 * The socket never delivers content — it says the thread changed, and this re-reads. That
 * is why a dropped connection degrades to "not live" rather than "wrong": the read is
 * always the source, and a reconnect triggers one because anything sent while the socket
 * was down was never announced.
 *
 * Sending invalidates rather than appending optimistically. A message the server refused
 * (the marriage ended between opening the thread and hitting send) must not sit in the
 * transcript looking delivered — and unlike a like button, the whole point of a message
 * is that the other person actually received it.
 */
export const useChatMessages = ({
    threadId,
    socketUrl,
}: UseChatMessagesOptions): UseChatMessagesResult => {
    const apiClient = useApiClient();
    const { isAuthenticated } = useAuth();
    const queryClient = useQueryClient();
    const baseURL = apiClient.defaults.baseURL ?? '';
    const queryKey = chatMessagesQueryKey(baseURL, threadId);

    const query = useQuery({
        queryKey,
        enabled: isAuthenticated && threadId != null,
        queryFn: async (): Promise<ChatPage> => {
            const { data } = await apiClient.get<Partial<ChatPage>>(
                `/api/chat/threads/${threadId}/messages`,
            );
            return { messages: data.messages ?? [], readUpTo: data.readUpTo ?? 0 };
        },
    });

    // Rebuilds the key inside rather than closing over the outer array, whose identity
    // changes every render — that is what previously needed an exhaustive-deps
    // suppression, and a suppression here would be permanent: this callback is wired to
    // the socket, the reconnect path and mutation success.
    const refresh = useCallback(() => {
        void queryClient.invalidateQueries({ queryKey: chatMessagesQueryKey(baseURL, threadId) });
    }, [queryClient, baseURL, threadId]);

    // A frame naming a message already in the cache is the echo of our own send, which
    // `onSuccess` has already applied — re-reading fifty messages to learn nothing.
    const onNotification = useCallback(
        (message: ChatThreadNotification) => {
            // A receipt always names a message this client already holds — that is what
            // being read means — so the echo check below would swallow every one of them.
            if (message.type === 'thread-read') {
                refresh();
                return;
            }
            const cached = queryClient.getQueryData<ChatPage>(
                chatMessagesQueryKey(baseURL, threadId),
            );
            if (cached?.messages.some((entry) => entry.id === message.messageId)) return;
            refresh();
        },
        [queryClient, baseURL, threadId, refresh],
    );

    const { connected, online } = useChatThreadSocket({
        url: socketUrl,
        threadId,
        onNotification,
        onReconnect: refresh,
    });

    const mutation = useMutation({
        mutationFn: async (text: string) => {
            const { data } = await apiClient.post<{ message: ChatMessage }>(
                `/api/chat/threads/${threadId}/messages`,
                { text },
            );
            return data.message;
        },
        // Appends the row the server just confirmed rather than invalidating. This is not
        // an optimistic update — the message exists — so the objection to optimism (a
        // refused send must not look delivered) does not apply, and it saves a full page
        // re-read per message sent.
        onSuccess: (message) => {
            queryClient.setQueryData<ChatPage>(
                chatMessagesQueryKey(baseURL, threadId),
                (previous) => {
                    const page = previous ?? { messages: [], readUpTo: 0 };
                    return page.messages.some((entry) => entry.id === message.id)
                        ? page
                        : { ...page, messages: [...page.messages, message] };
                },
            );
        },
    });

    /**
     * Moves this caller's watermark. Fire-and-forget: a receipt that fails to record is
     * a tick that stays single until the next read, which is the right way for this to
     * degrade — nothing about the conversation depends on it.
     */
    const markRead = useCallback(
        (messageId: number) => {
            if (!threadId || messageId <= 0) return;
            void apiClient
                .post(`/api/chat/threads/${threadId}/read`, { messageId })
                .catch(() => undefined);
        },
        [apiClient, threadId],
    );

    const send = useCallback(
        async (text: string) => {
            const trimmed = text.trim();
            if (!trimmed || !threadId) return;
            await mutation.mutateAsync(trimmed);
        },
        [mutation, threadId],
    );

    return {
        messages: query.data?.messages ?? [],
        readUpTo: query.data?.readUpTo ?? 0,
        markRead,
        isLoading: query.isLoading,
        error: query.error as Error | null,
        isLive: connected,
        online,
        send,
        isSending: mutation.isPending,
        sendError: mutation.error as Error | null,
    };
};
