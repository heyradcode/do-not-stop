import { useQuery } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { useState, useEffect } from 'react';
import { getStorageAdapter } from '../../../api';
import { useApiClient } from '../../../contexts/ApiClientContext';

/**
 * Gets the user profile from the backend (requires {@link ApiClientProvider}).
 */
export const useUserProfile = () => {
    const apiClient = useApiClient();
    const baseURL = apiClient.defaults.baseURL ?? '';
    const [hasToken, setHasToken] = useState(false);

    useEffect(() => {
        const checkToken = async () => {
            const storageAdapter = getStorageAdapter();
            if (!storageAdapter) {
                setHasToken(false);
                return;
            }

            try {
                const tokenResult = storageAdapter.getToken();
                const token = tokenResult instanceof Promise ? await tokenResult : tokenResult;
                setHasToken(!!token);
            } catch {
                setHasToken(false);
            }
        };

        checkToken();
    }, []);

    return useQuery({
        queryKey: ['user', 'profile', baseURL],
        queryFn: async () => {
            const { data } = await apiClient.get('/api/protected/profile');
            return data;
        },
        enabled: hasToken,
        retry: (failureCount, error) => {
            if (error instanceof AxiosError && error.response?.status === 401) {
                const adapter = getStorageAdapter();
                if (adapter) {
                    const removeResult = adapter.removeToken();
                    if (removeResult instanceof Promise) {
                        removeResult.catch(() => { });
                    }
                }
                return false;
            }
            return failureCount < 3;
        },
    });
};
