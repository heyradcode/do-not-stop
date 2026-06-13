import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    createAuthApiClient,
    getStorageAdapter,
    setStorageAdapter,
    type StorageAdapter,
} from '../src/api';

const makeAdapter = (over: Partial<StorageAdapter> = {}): StorageAdapter => ({
    getToken: vi.fn(),
    setToken: vi.fn(),
    removeToken: vi.fn(),
    ...over,
});

// Reach the registered interceptor handlers (axios keeps them on `.handlers`).
const requestHandler = (client: ReturnType<typeof createAuthApiClient>) =>
    (client.interceptors.request as unknown as { handlers: { fulfilled: (c: unknown) => Promise<{ headers: Record<string, unknown> }> }[] }).handlers[0].fulfilled;
const responseRejected = (client: ReturnType<typeof createAuthApiClient>) =>
    (client.interceptors.response as unknown as { handlers: { rejected: (e: unknown) => Promise<unknown> }[] }).handlers[0].rejected;

describe('storage adapter registry', () => {
    it('round-trips the active adapter', () => {
        const adapter = makeAdapter();
        setStorageAdapter(adapter);
        expect(getStorageAdapter()).toBe(adapter);
    });
});

describe('createAuthApiClient', () => {
    beforeEach(() => vi.clearAllMocks());

    it('configures the base URL and JSON content type', () => {
        const client = createAuthApiClient('https://api.test');
        expect(client.defaults.baseURL).toBe('https://api.test');
        expect(client.defaults.headers['Content-Type']).toBe('application/json');
    });

    it('attaches a bearer token from the adapter on request', async () => {
        setStorageAdapter(makeAdapter({ getToken: async () => 'tok123' }));
        const client = createAuthApiClient('https://api.test');

        const config = await requestHandler(client)({ headers: {} });
        expect(config.headers.Authorization).toBe('Bearer tok123');
    });

    it('leaves the request unauthenticated when there is no token', async () => {
        setStorageAdapter(makeAdapter({ getToken: async () => null }));
        const client = createAuthApiClient('https://api.test');

        const config = await requestHandler(client)({ headers: {} });
        expect(config.headers.Authorization).toBeUndefined();
    });

    it('clears the token on a 401 response', async () => {
        const removeToken = vi.fn();
        setStorageAdapter(makeAdapter({ removeToken }));
        const client = createAuthApiClient('https://api.test');

        await expect(responseRejected(client)({ response: { status: 401 } })).rejects.toEqual({
            response: { status: 401 },
        });
        expect(removeToken).toHaveBeenCalledOnce();
    });

    it('passes other errors through without clearing the token', async () => {
        const removeToken = vi.fn();
        setStorageAdapter(makeAdapter({ removeToken }));
        const client = createAuthApiClient('https://api.test');

        await expect(responseRejected(client)({ response: { status: 500 } })).rejects.toBeDefined();
        expect(removeToken).not.toHaveBeenCalled();
    });
});
