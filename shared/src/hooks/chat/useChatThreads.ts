import { useQuery } from '@tanstack/react-query';
import { useApiClient } from '../../contexts/ApiClientContext';
import { useAuth } from '../../contexts/AuthContext';

/** The married pet pair a thread exists because of. */
export interface ChatThreadPets {
    petId: string;
    petName: string;
    spousePetId: string;
    spouseName: string;
}

export interface ChatThread {
    threadId: string;
    /** The other participant's wallet address. */
    counterpart: string;
    /** Every married pet pair between the two owners; at least one, or the thread would not exist. */
    pets: ChatThreadPets[];
    chain: string;
}

export interface UseChatThreadsResult {
    threads: ChatThread[];
    isLoading: boolean;
    error: Error | null;
}

export const chatThreadsQueryKey = (baseURL: string) => ['chatThreads', baseURL];

/**
 * The threads the player may currently use — one per wallet they are married to.
 *
 * The list is derived by the backend from live marriage state, so a thread appearing or
 * disappearing here is the feature working, not a bug: a divorce closes the conversation.
 * The client does not decide who it may talk to and should not try to; every read and
 * send is authorized again server-side.
 */
export const useChatThreads = (): UseChatThreadsResult => {
    const apiClient = useApiClient();
    const { isAuthenticated } = useAuth();
    const baseURL = apiClient.defaults.baseURL ?? '';

    const query = useQuery({
        queryKey: chatThreadsQueryKey(baseURL),
        enabled: isAuthenticated,
        queryFn: async () => {
            const { data } = await apiClient.get<{ threads: ChatThread[] }>('/api/chat/threads');
            return data.threads ?? [];
        },
    });

    return {
        threads: query.data ?? [],
        isLoading: query.isLoading,
        error: query.error as Error | null,
    };
};
