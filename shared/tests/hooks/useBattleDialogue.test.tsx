// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const post = vi.fn();
const apiClient = { post };
const auth = { isAuthenticated: true };
vi.mock('../../src/contexts/ApiClientContext', () => ({ useApiClient: () => apiClient }));
vi.mock('../../src/contexts/AuthContext', () => ({ useAuth: () => auth }));

import { useBattleDialogue, type UseBattleDialogueOptions } from '../../src/hooks/useBattleDialogue';

const pet = (name: string) =>
    ({ petId: name, name, level: 1, rarity: 1, dna: '1', winCount: 0, lossCount: 0 });

const baseOptions = (over: Partial<UseBattleDialogueOptions> = {}): UseBattleDialogueOptions => ({
    chain: 'evm',
    battleId: 'tx1',
    attacker: pet('Hero'),
    defender: pet('Villain'),
    winner: 'attacker',
    ...over,
});

const wrapper = ({ children }: { children: React.ReactNode }) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

beforeEach(() => {
    vi.clearAllMocks();
    auth.isAuthenticated = true;
    post.mockResolvedValue({ data: { turns: [{ speaker: 'attacker', phase: 'result', text: 'gg' }] } });
});

describe('useBattleDialogue', () => {
    it('does not fetch until all inputs are ready', () => {
        const { result } = renderHook(() => useBattleDialogue(baseOptions({ battleId: null })), { wrapper });

        expect(post).not.toHaveBeenCalled();
        expect(result.current.turns).toEqual([]);
    });

    it('does not fetch when unauthenticated', () => {
        auth.isAuthenticated = false;
        renderHook(() => useBattleDialogue(baseOptions()), { wrapper });
        expect(post).not.toHaveBeenCalled();
    });

    it('fetches the conversation and exposes the turns', async () => {
        const { result } = renderHook(() => useBattleDialogue(baseOptions()), { wrapper });

        await waitFor(() => expect(result.current.turns).toHaveLength(1));
        expect(post).toHaveBeenCalledWith(
            '/api/battle-dialogue/result',
            expect.objectContaining({ chain: 'evm', battleId: 'tx1', winner: 'attacker' }),
        );
    });

    it('includes leveledUp in the payload when provided', async () => {
        const { result } = renderHook(() => useBattleDialogue(baseOptions({ leveledUp: true })), { wrapper });

        await waitFor(() => expect(result.current.turns).toHaveLength(1));
        expect(post).toHaveBeenCalledWith(
            '/api/battle-dialogue/result',
            expect.objectContaining({ leveledUp: true }),
        );
    });

    it('respects an explicit enabled=false', () => {
        renderHook(() => useBattleDialogue(baseOptions({ enabled: false })), { wrapper });
        expect(post).not.toHaveBeenCalled();
    });
});
