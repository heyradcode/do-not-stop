import { useQuery } from '@tanstack/react-query';
import { useApiClient } from '../../contexts/ApiClientContext';

/**
 * Fetches a nonce from the auth API (requires {@link ApiClientProvider}).
 */
export const useNonce = () => {
    const apiClient = useApiClient();
    const baseURL = apiClient.defaults.baseURL ?? '';

    const query = useQuery({
        queryKey: ['nonce', baseURL],
        queryFn: async () => {
            const { data } = await apiClient.get<{ nonce: string }>('/api/auth/nonce');
            if (data == null || typeof data.nonce !== 'string' || !data.nonce) {
                throw new Error('Invalid nonce response from server');
            }
            return data;
        },
        enabled: false,
        staleTime: 0,
        retry: 1,
    });

    return {
        ...query,
        /** True while a manual `refetch()` (sign-in) nonce request is in flight. */
        isNonceLoading: query.isFetching,
    };
};
