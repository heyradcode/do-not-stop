/**
 * Standing defence consent (§D). The parts worth pinning are what reaches `grant`:
 * a wrong scope here either exposes every pet a player owns or silently authorizes
 * none, and neither is visible in the UI afterwards.
 *
 * `@shared/core` is stubbed — its barrel drags the Solana runtime into jest.
 */

import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import type { Pet } from '@shared/core';

const pet = (over: Partial<Pet> = {}): Pet => ({
    id: '1',
    chain: 'evm',
    name: 'Rex',
    dna: 0n,
    level: 5,
    rarity: 2,
    winCount: 0,
    lossCount: 0,
    readyAt: 0,
    ...over,
});

const mockState = {
    pets: [pet(), pet({ id: '2', name: 'Momo' })] as Pet[],
    isConnected: true,
    isPending: false,
    error: null as Error | null,
};

const mockGrant = jest.fn(async () => '0xhash');
const mockRevoke = jest.fn(async () => true);

jest.mock('@shared/core', () => ({
    usePetList: () => ({ pets: mockState.pets, isLoading: false, error: null, refetch: jest.fn() }),
    useChainCapabilities: () => ({ isConnected: mockState.isConnected }),
    useDefenseAuthorization: () => ({
        grant: mockGrant,
        revoke: mockRevoke,
        isPending: mockState.isPending,
        error: mockState.error,
    }),
}));

const mockNotify = jest.fn();
jest.mock('../src/hooks/useNotifyError', () => ({ useNotifyError: () => mockNotify }));

const mockRouteParams: { petId?: string } = {};
jest.mock('@react-navigation/native', () => ({
    useRoute: () => ({ params: mockRouteParams }),
}));

import DefenseScreen from '../src/screens/DefenseScreen';

const render = async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
        tree = ReactTestRenderer.create(<DefenseScreen />);
    });
    return tree;
};

const textOf = (tree: ReactTestRenderer.ReactTestRenderer): string =>
    tree.root
        .findAllByType(Text)
        .map((n) => {
            const walk = (c: unknown): string =>
                typeof c === 'string' || typeof c === 'number'
                    ? String(c)
                    : Array.isArray(c)
                      ? c.map(walk).join('')
                      : '';
            return walk(n.props.children);
        })
        .join(' | ');

/**
 * ActionScreenLayout renders its children first, then the primary action, then the
 * secondary — so the two buttons are always the last two touchables, whatever the
 * checkbox rows above them look like.
 */
const press = async (tree: ReactTestRenderer.ReactTestRenderer, index: number) => {
    await ReactTestRenderer.act(async () => {
        tree.root.findAllByType(TouchableOpacity)[index].props.onPress();
    });
};

const pressAllow = async (tree: ReactTestRenderer.ReactTestRenderer) => {
    const buttons = tree.root.findAllByType(TouchableOpacity);
    await ReactTestRenderer.act(async () => {
        buttons[buttons.length - 2].props.onPress();
    });
};

const pressWithdraw = async (tree: ReactTestRenderer.ReactTestRenderer) => {
    const buttons = tree.root.findAllByType(TouchableOpacity);
    await ReactTestRenderer.act(async () => {
        buttons[buttons.length - 1].props.onPress();
    });
};

beforeEach(() => {
    mockState.pets = [pet(), pet({ id: '2', name: 'Momo' })];
    mockState.isConnected = true;
    mockState.isPending = false;
    mockState.error = null;
    delete mockRouteParams.petId;
    jest.clearAllMocks();
});

describe('DefenseScreen', () => {
    it('defaults to covering every pet, including future ones', async () => {
        const tree = await render();
        await pressAllow(tree);
        expect(mockGrant).toHaveBeenCalledWith({ allPets: true });
    });

    it('hides the per-pet list until the blanket scope is turned off', async () => {
        const tree = await render();
        expect(textOf(tree)).not.toContain('Momo');
        await press(tree, 0);
        expect(textOf(tree)).toContain('Momo');
    });

    it('grants only the chosen pets once narrowed', async () => {
        const tree = await render();
        await press(tree, 0); // turn off "all pets"
        await press(tree, 2); // second pet row (row 1 is the all-pets toggle)
        await pressAllow(tree);
        expect(mockGrant).toHaveBeenCalledWith({ petIds: ['2'] });
    });

    it('narrows to the pet a Gallery action arrived with, rather than granting for all', async () => {
        // Coming in from one pet's Defend button must not silently authorize the
        // whole wallet, which is what the default scope would do.
        mockRouteParams.petId = '2';
        const tree = await render();
        await pressAllow(tree);
        expect(mockGrant).toHaveBeenCalledWith({ petIds: ['2'] });
    });

    it('reports the scope it actually granted', async () => {
        const tree = await render();
        await pressAllow(tree);
        expect(textOf(tree)).toContain('Every pet you own can now be challenged.');
    });

    it('withdraws consent', async () => {
        const tree = await render();
        await pressWithdraw(tree);
        expect(mockRevoke).toHaveBeenCalled();
        expect(textOf(tree)).toContain('Consent withdrawn.');
    });

    it('notifies rather than signing when disconnected', async () => {
        mockState.isConnected = false;
        const tree = await render();
        await pressAllow(tree);
        expect(mockGrant).not.toHaveBeenCalled();
        expect(mockNotify).toHaveBeenCalledWith(
            'Please connect your wallet first',
            undefined,
            'defense-validation',
        );
    });

    it('surfaces a signing failure', async () => {
        mockState.error = new Error('User rejected the signature');
        const tree = await render();
        expect(textOf(tree)).toContain('User rejected the signature');
    });

    it('says so when there is nothing to authorize', async () => {
        mockState.pets = [];
        const tree = await render();
        await press(tree, 0);
        expect(textOf(tree)).toContain('No pets to authorize yet.');
    });
});
