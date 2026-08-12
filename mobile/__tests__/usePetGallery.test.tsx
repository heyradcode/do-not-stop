/**
 * The gallery screen is a pure view over this hook, so every decision the gallery
 * makes is made here and `GalleryScreen.test.tsx` stubs it out entirely.
 *
 * The parts worth pinning are the ones that are invisible when wrong: a
 * disconnected wallet still showing pets, a pull-to-refresh that never stops
 * spinning, and a mint that reports success without re-reading the list.
 *
 * `@shared/core` is stubbed, since its barrel drags the Solana runtime into jest.
 * `usePetCooldowns` runs for real, so every render here must be unmounted or its
 * interval outlives the test.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import type { Pet } from '@shared/core';

const pet = (over: Partial<Pet> = {}): Pet => ({
    id: '1',
    chain: 'evm',
    name: 'Rex',
    dna: 0n,
    level: 3,
    rarity: 2,
    winCount: 0,
    lossCount: 0,
    readyAt: 0,
    ...over,
});

const mockState = {
    pets: [pet()] as Pet[],
    isLoading: false,
    error: null as Error | null,
    isConnected: true,
    /** Pet id to its filled slots. A pet with no gear has no entry, by design. */
    equippedByPet: new Map<string, unknown[]>(),
};

const mockEquipmentArgs = jest.fn();
const mockRefetch = jest.fn(async () => undefined);
const mockNotify = jest.fn();
const mockNavigate = jest.fn();
/** Captures the options `useCreatePet` was constructed with, to fire onSuccess. */
const mockCreatePetOptions: { onSuccess?: () => void } = {};

jest.mock('@shared/core', () => ({
    // `usePetCooldowns` runs for real and reaches for these through the barrel.
    // They are dependency-free, so they come from their own module rather than
    // being faked.
    ...jest.requireActual('../../shared/src/utils/ethereum/petReadyTime'),
    /** Captured so the batched read can be asserted to ask for every pet, once. */
    usePetEquipmentForPets: (opts: { petIds: string[] }) => {
        mockEquipmentArgs(opts);
        return { byPet: mockState.equippedByPet, isLoading: false, error: null, refetch: jest.fn() };
    },
    usePetList: () => ({
        pets: mockState.pets,
        isLoading: mockState.isLoading,
        error: mockState.error,
        refetch: mockRefetch,
    }),
    useChainCapabilities: () => ({ isConnected: mockState.isConnected }),
    useCreatePet: (opts: { onSuccess?: () => void }) => {
        mockCreatePetOptions.onSuccess = opts?.onSuccess;
        return { mutate: jest.fn(), isPending: false, error: null, reset: jest.fn() };
    },
}));

jest.mock('../src/hooks/useNotifyError', () => ({ useNotifyError: () => mockNotify }));

jest.mock('@react-navigation/native', () => ({
    useNavigation: () => ({ navigate: mockNavigate }),
}));

import { usePetGallery, type UsePetGallery } from '../src/hooks/pet-gallery/usePetGallery';

/**
 * Renders the hook and hands back its latest value plus the renderer, so each
 * test can unmount. `usePetCooldowns` starts a 1s interval for a pet on cooldown
 * and without unmounting the cleanup never runs: assertions pass and then jest
 * hangs with no output, which reads like a parse failure rather than a timer.
 */
const renderHook = async () => {
    const seen: { current: UsePetGallery } = { current: null as unknown as UsePetGallery };
    const Probe = () => {
        seen.current = usePetGallery();
        return null;
    };
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
        tree = ReactTestRenderer.create(<Probe />);
    });
    // Unmounting is itself a React update, so it needs act() too. Without it every
    // test prints an "update was not wrapped in act(...)" warning and real ones
    // are lost in the noise.
    const unmount = async () => {
        await ReactTestRenderer.act(() => {
            tree.unmount();
        });
    };
    return { seen, unmount };
};

beforeEach(() => {
    mockState.pets = [pet()];
    mockState.isLoading = false;
    mockState.error = null;
    mockState.isConnected = true;
    jest.clearAllMocks();
});

describe('usePetGallery', () => {
    it('hides pets while no wallet is connected', async () => {
        // The list can outlive a disconnect in the query cache, and showing someone
        // else's pets to a disconnected wallet is worse than showing none.
        mockState.isConnected = false;
        const { seen, unmount } = await renderHook();
        expect(seen.current.pets).toEqual([]);
        await unmount();
    });

    it('passes pets through once connected', async () => {
        const { seen, unmount } = await renderHook();
        expect(seen.current.pets).toHaveLength(1);
        await unmount();
    });

    it('totals wins across pets, tolerating a missing count', async () => {
        mockState.pets = [
            pet({ id: '1', winCount: 3 }),
            pet({ id: '2', winCount: 4 }),
            pet({ id: '3', winCount: undefined as unknown as number }),
        ];
        const { seen, unmount } = await renderHook();
        expect(seen.current.totalWins).toBe(7);
        await unmount();
    });

    it('reports a load failure once rather than on every render', async () => {
        mockState.error = new Error('rpc down');
        const { unmount } = await renderHook();
        expect(mockNotify).toHaveBeenCalledTimes(1);
        expect(mockNotify).toHaveBeenCalledWith(
            'Failed to load pet data. Please try again.',
            mockState.error,
            'pet-list',
        );
        await unmount();
    });

    it('does not report anything when the load succeeds', async () => {
        const { unmount } = await renderHook();
        expect(mockNotify).not.toHaveBeenCalled();
        await unmount();
    });

    it('refetches on pull-to-refresh and clears the spinner', async () => {
        const { seen, unmount } = await renderHook();
        expect(seen.current.refreshing).toBe(false);

        await ReactTestRenderer.act(async () => {
            await seen.current.onRefresh();
        });

        expect(mockRefetch).toHaveBeenCalled();
        expect(seen.current.refreshing).toBe(false);
        await unmount();
    });

    it('clears the spinner even when the refetch fails', async () => {
        // Two things at once: without the `finally` the control spins forever, and
        // without the `catch` the rejection escapes as an unhandled one, because
        // `RefreshControl` discards what `onRefresh` returns.
        mockRefetch.mockRejectedValueOnce(new Error('offline'));
        const { seen, unmount } = await renderHook();

        await ReactTestRenderer.act(async () => {
            seen.current.onRefresh();
        });

        expect(seen.current.refreshing).toBe(false);
        await unmount();
    });

    it('re-reads the list only once the mint settles', async () => {
        // EVM minting is requestMintStarter then settleMint after Pyth Entropy
        // reveals, so refetching on submit would read the roster before the pet
        // exists.
        const { seen, unmount } = await renderHook();

        await ReactTestRenderer.act(async () => {
            seen.current.onOpenCreateModal();
        });
        expect(seen.current.createModalOpen).toBe(true);

        await ReactTestRenderer.act(async () => {
            mockCreatePetOptions.onSuccess?.();
        });

        expect(seen.current.createModalOpen).toBe(false);
        expect(mockRefetch).toHaveBeenCalledTimes(1);
        await unmount();
    });

    it('opens and closes the create modal', async () => {
        const { seen, unmount } = await renderHook();
        await ReactTestRenderer.act(async () => {
            seen.current.onOpenCreateModal();
        });
        expect(seen.current.createModalOpen).toBe(true);

        await ReactTestRenderer.act(async () => {
            seen.current.onCloseCreateModal();
        });
        expect(seen.current.createModalOpen).toBe(false);
        await unmount();
    });

    it('routes each per-pet action to the screen that acts on that pet', async () => {
        const { seen, unmount } = await renderHook();
        const target = pet({ id: '42' });

        await ReactTestRenderer.act(async () => {
            seen.current.onBattle(target);
            seen.current.onRename(target);
            seen.current.onDefend(target);
        });

        // Battle is a tab, so it is reached through the tab navigator; Rename and
        // Defense are stack routes pushed over the shell (plan 3.1).
        expect(mockNavigate).toHaveBeenNthCalledWith(1, 'Main', {
            screen: 'Battle',
            params: { petId: '42' },
        });
        expect(mockNavigate).toHaveBeenNthCalledWith(2, 'Rename', { petId: '42' });
        expect(mockNavigate).toHaveBeenNthCalledWith(3, 'Defense', { petId: '42' });
        await unmount();
    });
});

/**
 * Gear is read for the whole roster in one request.
 *
 * `usePetEquipmentForPets` exists precisely so a gallery does not fire one query per
 * card, and it had no mobile caller at all until now. Asserting the id list rather than
 * the call count is what pins that: a per-card hook would ask for one id at a time.
 */
describe('usePetGallery equipment', () => {
    it('asks for every pet at once, not one query per card', async () => {
        mockState.pets = [pet({ id: '1' }), pet({ id: '2' }), pet({ id: '3' })];
        const { unmount } = await renderHook();

        const asked = mockEquipmentArgs.mock.calls.at(-1)?.[0] as { petIds: string[] };
        expect(asked.petIds).toEqual(['1', '2', '3']);
        await unmount();
    });

    it('reports undefined for a pet wearing nothing, which is how the read omits it', async () => {
        mockState.pets = [pet({ id: '1' }), pet({ id: '2' })];
        mockState.equippedByPet = new Map([['1', [{ slot: 0 }]]]);
        const { seen, unmount } = await renderHook();

        expect(seen.current.equippedFor('1')).toHaveLength(1);
        expect(seen.current.equippedFor('2')).toBeUndefined();
        await unmount();
    });
});
