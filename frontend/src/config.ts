import { setTokenSuccessCallback, setStorageAdapter, type StorageAdapter } from '@shared/core';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * Per-room notification channel for backend-authoritative battles
 * (`docs/plan-backend-battle-architecture.md` §J).
 *
 * Lives here rather than in `petsContractParams` because it is chain-neutral: backend
 * battles run on both EVM and Solana, while that module is the EVM contract config and
 * carries the separate, legacy `/ws/live-battle` endpoint for the on-chain settle flow.
 *
 * A client that cannot reach this still converges on the same state by polling the read
 * APIs, so an unreachable socket costs latency, never correctness.
 */
export const BATTLE_ROOM_WS_URL = `${API_URL.replace(/^http/, 'ws')}/ws/battle-room`;

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
