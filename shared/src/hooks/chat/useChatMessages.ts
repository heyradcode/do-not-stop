import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '../../contexts/ApiClientContext';
import { useAuth } from '../../contexts/AuthContext';
import { useChatThreadSocket } from './useChatThreadSocket';

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

export interface UseChatMessagesResult {
    messages: ChatMessage[];
    isLoading: boolean;
    error: Error | null;
    /** True while the notification channel is connected; false means reads are on demand only. */
    isLive: boolean;
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
        queryFn: async () => {
            const { data } = await apiClient.get<{ messages: ChatMessage[] }>(
                `/api/chat/threads/${threadId}/messages`,
            );
            return data.messages ?? [];
        },
    });

    const refresh = useCallback(() => {
        void queryClient.invalidateQueries({ queryKey });
        // `queryKey` is rebuilt each render; its contents are what identify the query.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [queryClient, baseURL, threadId]);

    const { connected } = useChatThreadSocket({
        url: socketUrl,
        threadId,
        onNotification: refresh,
        onReconnect: refresh,
    });

    const mutation = useMutation({
        mutationFn: async (text: string) => {
            await apiClient.post(`/api/chat/threads/${threadId}/messages`, { text });
        },
        onSuccess: refresh,
    });

    const send = useCallback(
        async (text: string) => {
            const trimmed = text.trim();
            if (!trimmed || !threadId) return;
            await mutation.mutateAsync(trimmed);
        },
        [mutation, threadId],
    );

    return {
        messages: query.data ?? [],
        isLoading: query.isLoading,
        error: query.error as Error | null,
        isLive: connected,
        send,
        isSending: mutation.isPending,
        sendError: mutation.error as Error | null,
    };
};
