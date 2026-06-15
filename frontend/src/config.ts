import { setTokenSuccessCallback, setStorageAdapter } from '@shared/core';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * @deprecated v1 single-contract address. v2 uses VITE_PETCORE_ADDRESS /
 * VITE_GAMELOGIC_ADDRESS (see chains/ethereum/contracts.ts), which default to
 * the live Sepolia deployment, so a missing value is no longer fatal.
 */
export const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;

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
