// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const apiClient = { defaults: { baseURL: 'https://api.test' } };
vi.mock('../../src/contexts/ApiClientContext', () => ({ useApiClient: () => apiClient }));

let token: string | null = 'tok';
vi.mock('../../src/api', () => ({ getStorageAdapter: () => ({ getToken: async () => token }) }));

import { useBattleTaunts, type GenerateTauntsVars } from '../../src/hooks/battle/useBattleTaunts';

const vars = {
    chain: 'evm',
    attacker: { name: 'Hero' },
    defender: { name: 'Villain' },
} as unknown as GenerateTauntsVars;

// Non-streaming response (no getReader) — the React Native path.
const jsonResponse = (ok: boolean, ndjson = '') => ({
    ok,
    body: null,
    text: async () => ndjson,
});

beforeEach(() => {
    token = 'tok';
    vi.restoreAllMocks();
});
afterEach(() => vi.unstubAllGlobals());

describe('useBattleTaunts', () => {
    it('posts to the stream endpoint with the bearer token and applies the final snapshot', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValue(jsonResponse(true, '{"turns":[{"speaker":"attacker","text":"hi"}]}'));
        vi.stubGlobal('fetch', fetchMock);

        const { result } = renderHook(() => useBattleTaunts());
        act(() => result.current.generate(vars));

        await waitFor(() => expect(result.current.turns).toHaveLength(1));

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://api.test/api/battle-dialogue/taunts/stream');
        expect(init.method).toBe('POST');
        expect(init.headers.Authorization).toBe('Bearer tok');
        expect(result.current.isLoading).toBe(false);
    });

    it('omits the auth header when there is no token', async () => {
        token = null;
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(true, '{"turns":[]}'));
        vi.stubGlobal('fetch', fetchMock);

        const { result } = renderHook(() => useBattleTaunts());
        act(() => result.current.generate(vars));

        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
    });

    it('leaves turns empty when the response is not ok', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(false)));

        const { result } = renderHook(() => useBattleTaunts());
        act(() => result.current.generate(vars));

        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.turns).toEqual([]);
    });

    it('leaves turns empty on a network failure', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

        const { result } = renderHook(() => useBattleTaunts());
        act(() => result.current.generate(vars));

        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.turns).toEqual([]);
    });

    it('reset clears turns and loading', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(true, '{"turns":[{"text":"x"}]}')));

        const { result } = renderHook(() => useBattleTaunts());
        act(() => result.current.generate(vars));
        await waitFor(() => expect(result.current.turns).toHaveLength(1));

        act(() => result.current.reset());
        expect(result.current.turns).toEqual([]);
        expect(result.current.isLoading).toBe(false);
    });
});
