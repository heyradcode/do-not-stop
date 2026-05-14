import { useQuery } from '@tanstack/react-query';
import { useApiClient } from '../../contexts/ApiClientContext';

/**
 * Fetches a nonce from the auth API (requires {@link ApiClientProvider}).
 */
export const useNonce = () => {
    const apiClient = useApiClient();
    const baseURL = apiClient.defaults.baseURL ?? '';

    return useQuery({
        queryKey: ['nonce', baseURL],
        queryFn: async () => {
            const { data } = await apiClient.get('/api/auth/nonce');
            return data;
        },
        enabled: false,
        staleTime: 0,
    });
};
