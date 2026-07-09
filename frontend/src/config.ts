import { setTokenSuccessCallback, setStorageAdapter, type StorageAdapter } from '@shared/core';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const AUTH_TOKEN_KEY = 'authToken';

// localStorage-backed token persistence — the single source of truth for the key.
const storageAdapter: StorageAdapter = {
    getToken: () => localStorage.getItem(AUTH_TOKEN_KEY),
    setToken: (token) => localStorage.setItem(AUTH_TOKEN_KEY, token),
    removeToken: () => localStorage.removeItem(AUTH_TOKEN_KEY),
};

setStorageAdapter(storageAdapter);

// On a successful verify, persist the new token through the same adapter.
setTokenSuccessCallback((data) => {
    if (data.success) storageAdapter.setToken(data.token);
});
