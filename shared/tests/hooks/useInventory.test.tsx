// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const post = vi.fn();
const apiClient = { post, defaults: { baseURL: 'https://api.test' } };
const auth = { isAuthenticated: true };
vi.mock('../../src/contexts/ApiClientContext', () => ({ useApiClient: () => apiClient }));
vi.mock('../../src/contexts/AuthContext', () => ({ useAuth: () => auth }));

import { useInventory } from '../../src/hooks/inventory/useInventory';
import { usePetEquipment } from '../../src/hooks/inventory/usePetEquipment';
import { useSpendItem } from '../../src/hooks/inventory/useSpendItem';

/** The wire shape: `effect` is a JSON string, as the server sends it. */
const POTION = {
    itemType: '100',
    key: 'xp_potion_i',
    category: 'consumable',
    slot: null,
    rarity: 1,
    effect: '{"kind":"grant_xp","amount":50}',
    name: 'Lesser Tonic',
    description: 'Tastes of copper.',
};

const BADGE = { ...POTION, itemType: '201', key: 'founders_badge', category: 'collectible', effect: null };

const BLADE = {
    ...POTION,
    itemType: '1',
    key: 'iron_fang',
    category: 'equipment',
    slot: 0,
    effect: '{"kind":"stat_bonus","hp":0,"atk":4,"def":0,"int":0,"mdef":0}',
    name: 'Iron Fang',
};

const wrapper = ({ children }: { children: React.ReactNode }) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

beforeEach(() => {
    vi.clearAllMocks();
    auth.isAuthenticated = true;
});

describe('useInventory', () => {
    beforeEach(() => {
        post.mockResolvedValue({ data: { data: { inventory: [{ item: POTION, quantity: '3' }] } } });
    });

    it('does not fetch without a chain', () => {
        const { result } = renderHook(() => useInventory({ chain: null }), { wrapper });
        expect(post).not.toHaveBeenCalled();
        expect(result.current.entries).toEqual([]);
    });

    // Without a session the server has no owner to answer for and returns an empty bag,
    // which would render as "you own nothing" rather than as "sign in".
    it('does not fetch when unauthenticated', () => {
        auth.isAuthenticated = false;
        renderHook(() => useInventory({ chain: 'evm' }), { wrapper });
        expect(post).not.toHaveBeenCalled();
    });

    it('parses the effect JSON the server sends as a string', async () => {
        const { result } = renderHook(() => useInventory({ chain: 'evm' }), { wrapper });

        await waitFor(() => expect(result.current.entries).toHaveLength(1));
        expect(result.current.entries[0]!.item.effect).toEqual({ kind: 'grant_xp', amount: 50 });
        expect(result.current.entries[0]!.quantity).toBe('3');
    });

    // The owner is the session's, so the query carries no address at all — there is no
    // spelling of this that reads another wallet's bag.
    it('sends no owner argument', async () => {
        renderHook(() => useInventory({ chain: 'evm' }), { wrapper });

        await waitFor(() => expect(post).toHaveBeenCalled());
        const body = post.mock.calls[0]![1] as { query: string; variables: Record<string, unknown> };
        expect(Object.keys(body.variables)).toEqual(['chain']);
        expect(body.query).not.toContain('owner:');
    });

    it('keeps a null effect null rather than inventing one', async () => {
        post.mockResolvedValue({ data: { data: { inventory: [{ item: BADGE, quantity: '1' }] } } });
        const { result } = renderHook(() => useInventory({ chain: 'evm' }), { wrapper });

        await waitFor(() => expect(result.current.entries).toHaveLength(1));
        expect(result.current.entries[0]!.item.effect).toBeNull();
    });

    // A client older than the effect kind it is looking at is the ordinary case, not an
    // error: the item still renders, without whatever it does.
    it('drops an unrecognised effect kind without losing the item', async () => {
        post.mockResolvedValue({
            data: { data: { inventory: [{ item: { ...POTION, effect: '{"kind":"teleport"}' }, quantity: '1' }] } },
        });
        const { result } = renderHook(() => useInventory({ chain: 'evm' }), { wrapper });

        await waitFor(() => expect(result.current.entries).toHaveLength(1));
        expect(result.current.entries[0]!.item.effect).toBeNull();
        expect(result.current.entries[0]!.item.name).toBe('Lesser Tonic');
    });

    it('surfaces a GraphQL error rather than an empty bag', async () => {
        post.mockResolvedValue({ data: { errors: [{ message: 'boom' }] } });
        const { result } = renderHook(() => useInventory({ chain: 'evm' }), { wrapper });

        await waitFor(() => expect(result.current.error).toBeTruthy());
        expect(result.current.error!.message).toContain('boom');
    });
});

describe('usePetEquipment', () => {
    beforeEach(() => {
        post.mockResolvedValue({ data: { data: { petEquipment: [{ slot: 0, item: BLADE }] } } });
    });

    it('does not fetch without a pet id', () => {
        renderHook(() => usePetEquipment({ chain: 'evm', petId: null }), { wrapper });
        expect(post).not.toHaveBeenCalled();
    });

    it('indexes equipped items by slot', async () => {
        const { result } = renderHook(() => usePetEquipment({ chain: 'evm', petId: '7' }), { wrapper });

        await waitFor(() => expect(result.current.equipped).toHaveLength(1));
        expect(result.current.bySlot.get(0)!.item.key).toBe('iron_fang');
        expect(result.current.bySlot.get(1)).toBeUndefined();
    });

    it('parses a stat bonus', async () => {
        const { result } = renderHook(() => usePetEquipment({ chain: 'evm', petId: '7' }), { wrapper });

        await waitFor(() => expect(result.current.equipped).toHaveLength(1));
        expect(result.current.equipped[0]!.item.effect).toEqual({
            kind: 'stat_bonus', hp: 0, atk: 4, def: 0, int: 0, mdef: 0,
        });
    });
});

describe('useSpendItem', () => {
    it('posts to the REST route, since the backend burns rather than the player signing', async () => {
        post.mockResolvedValue({ data: { burnTxHash: '0xburn', level: 5, xp: 0, readyAt: 0, leveledUp: true } });
        const { result } = renderHook(() => useSpendItem(), { wrapper });

        const outcome = await result.current.spend({ chain: 'evm', petId: '7', itemType: '100' });

        expect(post).toHaveBeenCalledWith('/api/inventory/use', { chain: 'evm', petId: '7', itemType: '100' });
        expect(outcome.leveledUp).toBe(true);
    });

    // Never optimistic: the burn is a transaction, so until the server says it landed the
    // item is still the player's, and a bag showing it gone would be lying about a spend
    // that can still fail.
    it('surfaces a rejected spend rather than reporting success', async () => {
        post.mockRejectedValue(new Error('You do not hold that item'));
        const { result } = renderHook(() => useSpendItem(), { wrapper });

        await expect(
            result.current.spend({ chain: 'evm', petId: '7', itemType: '100' }),
        ).rejects.toThrow('You do not hold that item');
    });
});
