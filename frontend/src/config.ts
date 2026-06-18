import { setTokenSuccessCallback, setStorageAdapter } from '@shared/core';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Configure token storage callback
setTokenSuccessCallback((data) => {
    if (data.success) {
        localStorage.setItem('authToken', data.token);
    }
});

// Configure storage adapter
setStorageAdapter({
    getToken: () => localStorage.getItem('authToken'),
    setToken: (token: string) => localStorage.setItem('authToken', token),
    removeToken: () => localStorage.removeItem('authToken'),
});
