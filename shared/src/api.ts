import axios, { type AxiosInstance, type AxiosError } from 'axios';

/**
 * Storage adapter interface for platform-specific token storage
 */
export interface StorageAdapter {
    getToken: () => Promise<string | null> | string | null;
    setToken: (token: string) => Promise<void> | void;
    removeToken: () => Promise<void> | void;
}

// Global storage adapter (shared between API client and AuthContext)
let storageAdapter: StorageAdapter | undefined;

// Called when any API response returns 401 — lets AuthContext clear its state.
let unauthorizedCallback: (() => void) | undefined;
export const setUnauthorizedCallback = (cb: () => void): void => {
    unauthorizedCallback = cb;
};

/**
 * Sets the storage adapter for platform-specific token storage
 * Used by both API client interceptors and AuthContext
 */
export const setStorageAdapter = (adapter: StorageAdapter): void => {
    storageAdapter = adapter;
};

/**
 * Gets the storage adapter (for use by AuthContext and other hooks)
 */
export const getStorageAdapter = (): StorageAdapter | undefined => {
    return storageAdapter;
};

/**
 * Creates an axios instance for auth API calls with the given base URL.
 * One instance per AuthProvider - avoids global singleton / duplicate bundles missing config.
 */
export const createAuthApiClient = (baseURL: string): AxiosInstance => {
    const client = axios.create({
        baseURL,
        headers: {
            'Content-Type': 'application/json',
        },
    });

    client.interceptors.request.use(async (config) => {
        if (storageAdapter) {
            const token = await storageAdapter.getToken();
            if (token) {
                config.headers.Authorization = `Bearer ${token}`;
            }
        }
        return config;
    });

    client.interceptors.response.use(
        (response) => response,
        async (error: AxiosError) => {
            if (error.response?.status === 401 && storageAdapter) {
                await storageAdapter.removeToken();
                unauthorizedCallback?.();
            }
            return Promise.reject(error);
        }
    );

    return client;
};

/**
 * Generic API client type
 */
export interface AuthApiClient {
    get<T>(url: string): Promise<{ data: T }>;
    post<T>(url: string, data?: any): Promise<{ data: T }>;
}
