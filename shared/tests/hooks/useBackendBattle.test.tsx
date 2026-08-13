// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.hoisted(() => vi.fn());
const socket = vi.hoisted(() => ({
    onNotification: undefined as undefined | (() => void),
    onReconnect: undefined as undefined | (() => void),
    connected: false,
}));

vi.mock('../../src/contexts/ApiClientContext', () => ({ useApiClient: () => ({ get, post: vi.fn() }) }));
vi.mock('../../src/hooks/battle/useBattleRoomSocket', () => ({
    useBattleRoomSocket: (options: { onNotification?: () => void; onReconnect?: () => void }) => {
        socket.onNotification = options.onNotification;
        socket.onReconnect = options.onReconnect;
        return { connected: socket.connected };
    },
}));

import { setEvidenceStore, saveBattleEvidence, type EvidenceStore } from '../../src/utils/battleEvidence';
import { useBackendBattle, useStoredBattleEvidence } from '../../src/hooks/battle/useBackendBattle';

function summary(state: string) {
    return {
        battleId: 'btl_0001',
        chainId: 'eip155:84532',
        deploymentId: 'base-sepolia-live',
        state,
        failureReason: null,
        attackerPetId: '1',
        attackerOwner: '0xabc',
        defenderPetId: '2',
        defenderOwner: '0xdef',
        rulesetHash: `0x${'11'.repeat(32)}`,
        createdAt: '2026-07-26T00:00:00.000Z',
        updatedAt: '2026-07-26T00:00:01.000Z',
    };
}

function memoryStore(): EvidenceStore {
    const map = new Map<string, string>();
    return {
        getItem: (key) => map.get(key) ?? null,
        setItem: (key, value) => void map.set(key, value),
        removeItem: (key) => void map.delete(key),
    };
}

function wrapper({ children }: { children: React.ReactNode }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return React.createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
    vi.clearAllMocks();
    socket.connected = false;
    setEvidenceStore(memoryStore());
    get.mockResolvedValue({ data: summary('committed') });
});

afterEach(() => setEvidenceStore(null));

describe('reading the authoritative endpoint', () => {
    it('fetches the battle state', async () => {
        const { result } = renderHook(() => useBackendBattle('btl_0001'), { wrapper });

        await waitFor(() => expect(result.current.data).toEqual(summary('committed')));
        expect(get).toHaveBeenCalledWith('/api/battle/btl_0001');
    });

    it('does not fetch without a battle id', () => {
        renderHook(() => useBackendBattle(null), { wrapper });
        expect(get).not.toHaveBeenCalled();
    });

    // Every receipt-bearing state, not just the ends of the range. `published` sits
    // between the other two and was missing, which stranded battles on any deployment
    // that does not run the Merkle batcher: `published` is where they stop, so
    // verification never ran and the poll never ended.
    it.each(['signed', 'published', 'batched'])(
        'reports %s as settled, since a receipt exists in all three',
        async (state) => {
            get.mockResolvedValue({ data: summary(state) });
            const { result } = renderHook(() => useBackendBattle('btl_0001'), { wrapper });

            await waitFor(() => expect(result.current.isSettled).toBe(true));
        },
    );

    it('treats a failure state as settled too, so a failed battle stops being polled', async () => {
        get.mockResolvedValue({ data: summary('verification_failed') });
        const { result } = renderHook(() => useBackendBattle('btl_0001'), { wrapper });

        await waitFor(() => expect(result.current.isSettled).toBe(true));
    });

    it('does not treat an in-flight state as settled', async () => {
        const { result } = renderHook(() => useBackendBattle('btl_0001'), { wrapper });
        await waitFor(() => expect(result.current.data).toBeDefined());
        expect(result.current.isSettled).toBe(false);
    });
});

describe('the socket is a hint, never the truth', () => {
    it('re-reads the authoritative endpoint when a notification arrives', async () => {
        const { result } = renderHook(() => useBackendBattle('btl_0001', { roomId: 'room_1', roomSocketUrl: 'ws://x' }), {
            wrapper,
        });
        await waitFor(() => expect(result.current.data).toBeDefined());
        const before = get.mock.calls.length;

        get.mockResolvedValue({ data: summary('signed') });
        await act(async () => void socket.onNotification?.());

        await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(before));
        await waitFor(() => expect(result.current.data?.state).toBe('signed'));
    });

    it('re-reads after a reconnect, since anything during the outage was never delivered', async () => {
        const { result } = renderHook(() => useBackendBattle('btl_0001', { roomId: 'room_1', roomSocketUrl: 'ws://x' }), {
            wrapper,
        });
        await waitFor(() => expect(result.current.data).toBeDefined());
        const before = get.mock.calls.length;

        get.mockResolvedValue({ data: summary('signed') });
        await act(async () => void socket.onReconnect?.());

        await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(before));
        await waitFor(() => expect(result.current.data?.state).toBe('signed'));
    });

    it('surfaces socket connectivity without letting it gate the data', async () => {
        socket.connected = true;
        const { result } = renderHook(() => useBackendBattle('btl_0001', { roomId: 'room_1', roomSocketUrl: 'ws://x' }), {
            wrapper,
        });

        await waitFor(() => expect(result.current.data).toBeDefined());
        expect(result.current.socketConnected).toBe(true);
    });

    it('still reads the endpoint with no room at all', async () => {
        // A client that never subscribed converges on the same state by polling; the socket
        // only makes that faster.
        const { result } = renderHook(() => useBackendBattle('btl_0001'), { wrapper });
        await waitFor(() => expect(result.current.data).toEqual(summary('committed')));
    });
});

describe('useStoredBattleEvidence', () => {
    it('returns the evidence this client stored for the battle', async () => {
        saveBattleEvidence({
            battleId: 'btl_0001',
            commitmentHash: `0x${'11'.repeat(32)}`,
            signature: `0x${'22'.repeat(65)}`,
            signingKeyId: 'battle-signer-2026-07',
            commitment: { drandRound: 1000 },
            storedAt: 1,
        });

        const { result } = renderHook(() => useStoredBattleEvidence('btl_0001'));
        await waitFor(() => expect(result.current?.commitmentHash).toBe(`0x${'11'.repeat(32)}`));
    });

    it('returns null on a client that never accepted this battle', async () => {
        // A spectator was never promised anything, so having nothing stored is correct.
        const { result } = renderHook(() => useStoredBattleEvidence('btl_0001'));
        await waitFor(() => expect(result.current).toBeNull());
    });

    it('returns null without a battle id', async () => {
        const { result } = renderHook(() => useStoredBattleEvidence(null));
        await waitFor(() => expect(result.current).toBeNull());
    });
});
