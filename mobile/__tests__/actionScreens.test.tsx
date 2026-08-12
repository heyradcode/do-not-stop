/**
 * Level Up, Train and Rename: the three single-mutation screens. Each is checked
 * for the parts that are easy to get wrong and invisible until a wallet is
 * attached — the level-scaled fee in the button label, the validation gate, and
 * what reaches `mutate`.
 *
 * `@shared/core` is stubbed rather than imported: its barrel re-exports the Solana
 * adapter and drags an unparseable runtime into jest (see GalleryScreen.test.tsx).
 */

import React from 'react';
import { Text, TextInput, TouchableOpacity } from 'react-native';
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
    pets: [pet()] as Pet[],
    isConnected: true,
    renameMinLevel: 1,
    levelUpFee: 1000n as bigint | null,
    trainFee: 1000n as bigint | null,
};

const mockMutations = {
    levelUp: jest.fn(),
    train: jest.fn(),
    rename: jest.fn(),
};

const mutationResult = (mutate: jest.Mock) => ({
    mutate,
    isPending: false,
    error: null,
    reset: jest.fn(),
    lifecycle: {},
});

jest.mock('@shared/core', () => ({
    useSyncMetadata: () => ({ sync: jest.fn(), isPending: false, error: null }),
    getReadyPetsUnified: (pets: Pet[]) => pets.map((p) => ({ id: p.id, pet: p })),
    usePetList: () => ({ pets: mockState.pets, isLoading: false, error: null, refetch: jest.fn() }),
    useChainCapabilities: () => ({
        isConnected: mockState.isConnected,
        renameMinLevel: mockState.renameMinLevel,
    }),
    useFees: () => ({
        levelUpFee: mockState.levelUpFee,
        trainFee: mockState.trainFee,
        // Mirrors the real formatter closely enough to assert the scaling maths.
        formatAmount: (v: bigint) => `${v.toString()} wei`,
    }),
    useLevelUpPet: () => mutationResult(mockMutations.levelUp),
    useTrainPet: () => mutationResult(mockMutations.train),
    useRenamePet: () => mutationResult(mockMutations.rename),
}));

const mockNotify = jest.fn();
jest.mock('../src/hooks/useNotifyError', () => ({ useNotifyError: () => mockNotify }));
jest.mock('../src/hooks/useTxErrorToast', () => ({ useTxErrorToast: () => {} }));

const mockRouteParams: { petId?: string } = {};
jest.mock('@react-navigation/native', () => ({
    useRoute: () => ({ params: mockRouteParams }),
}));

import LevelUpScreen from '../src/screens/LevelUpScreen';
import TrainScreen from '../src/screens/TrainScreen';
import RenameScreen from '../src/screens/RenameScreen';

const render = async (Screen: React.ComponentType) => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
        tree = ReactTestRenderer.create(<Screen />);
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

/** The action button is the last touchable the layout renders. */
const pressAction = async (tree: ReactTestRenderer.ReactTestRenderer) => {
    const buttons = tree.root.findAllByType(TouchableOpacity);
    await ReactTestRenderer.act(() => {
        buttons[buttons.length - 1].props.onPress();
    });
};

const selectFirstPet = async (tree: ReactTestRenderer.ReactTestRenderer) => {
    await ReactTestRenderer.act(() => {
        tree.root.findAllByType(TouchableOpacity)[0].props.onPress();
    });
};

beforeEach(() => {
    mockState.pets = [pet()];
    mockState.isConnected = true;
    mockState.renameMinLevel = 1;
    mockState.levelUpFee = 1000n;
    mockState.trainFee = 1000n;
    delete mockRouteParams.petId;
    jest.clearAllMocks();
});

describe('LevelUpScreen', () => {
    it('scales the fee by (level-1)² and shows it on the button', async () => {
        // level 5 → 100 + 4² = 116 → 1000 * 116 / 100 = 1160
        const tree = await render(LevelUpScreen);
        await selectFirstPet(tree);
        expect(textOf(tree)).toContain('Level Up (1160 wei)');
    });

    it('omits the cost until a pet is chosen, since the fee depends on its level', async () => {
        const tree = await render(LevelUpScreen);
        expect(textOf(tree)).toContain('Level Up');
        expect(textOf(tree)).not.toContain('wei');
    });

    it('passes the selected pet to the mutation', async () => {
        const tree = await render(LevelUpScreen);
        await selectFirstPet(tree);
        await pressAction(tree);
        expect(mockMutations.levelUp).toHaveBeenCalledWith({ petId: '1' });
    });

    it('notifies rather than mutating when disconnected', async () => {
        mockState.isConnected = false;
        const tree = await render(LevelUpScreen);
        await selectFirstPet(tree);
        await pressAction(tree);
        expect(mockMutations.levelUp).not.toHaveBeenCalled();
        expect(mockNotify).toHaveBeenCalledWith(
            'Please connect your wallet first',
            undefined,
            'level-up-validation',
        );
    });
});

describe('TrainScreen', () => {
    it('scales the fee by 2·level, a different curve from level-up', async () => {
        // level 5 → 100 + 10 = 110 → 1000 * 110 / 100 = 1100
        const tree = await render(TrainScreen);
        await selectFirstPet(tree);
        expect(textOf(tree)).toContain('Train (1100 wei)');
    });

    it('still offers the action when the fee has not loaded', async () => {
        mockState.trainFee = null;
        const tree = await render(TrainScreen);
        await selectFirstPet(tree);
        expect(textOf(tree)).toContain('Train');
    });
});

describe('RenameScreen', () => {
    it('rejects a name below the minimum length', async () => {
        const tree = await render(RenameScreen);
        await selectFirstPet(tree);
        await ReactTestRenderer.act(() => {
            tree.root.findByType(TextInput).props.onChangeText('a');
        });
        expect(textOf(tree)).toContain('○ Min 2 characters');
    });

    it('trims before sending, so trailing spaces do not reach the chain', async () => {
        const tree = await render(RenameScreen);
        await selectFirstPet(tree);
        await ReactTestRenderer.act(() => {
            tree.root.findByType(TextInput).props.onChangeText('  Blaze  ');
        });
        await pressAction(tree);
        expect(mockMutations.rename).toHaveBeenCalledWith({ petId: '1', name: 'Blaze' });
    });

    it('preselects the pet a Gallery action arrived with', async () => {
        mockState.pets = [pet(), pet({ id: '2', name: 'Momo' })];
        mockRouteParams.petId = '2';
        const tree = await render(RenameScreen);
        await ReactTestRenderer.act(() => {
            tree.root.findByType(TextInput).props.onChangeText('Blaze');
        });
        await pressAction(tree);
        expect(mockMutations.rename).toHaveBeenCalledWith({ petId: '2', name: 'Blaze' });
    });

    it('hides pets below the chain minimum level', async () => {
        mockState.renameMinLevel = 10;
        mockState.pets = [pet({ level: 5 })];
        const tree = await render(RenameScreen);
        expect(textOf(tree)).toContain('level 10 or above');
    });
});

describe('PetPicker empty states', () => {
    /**
     * A wallet with no pets and a wallet whose pets are all busy look identical
     * to the picker. On device an empty roster read "No pets are off cooldown
     * right now", which tells a player with nothing to their name that their
     * pets are resting.
     */
    it('sends a player with no pets to the Gallery rather than blaming cooldown', async () => {
        mockState.pets = [];
        const tree = await render(LevelUpScreen);
        expect(textOf(tree)).toContain('Mint one from the Gallery');
        expect(textOf(tree)).not.toContain('off cooldown');
    });

    it('still blames the filter when the wallet does hold pets', async () => {
        mockState.renameMinLevel = 10;
        mockState.pets = [pet({ level: 5 })];
        const tree = await render(RenameScreen);
        expect(textOf(tree)).toContain('level 10 or above');
        expect(textOf(tree)).not.toContain('Mint one from the Gallery');
    });

    it('applies to Train too, not just Level Up', async () => {
        mockState.pets = [];
        const tree = await render(TrainScreen);
        expect(textOf(tree)).toContain('Mint one from the Gallery');
        expect(textOf(tree)).not.toContain('off cooldown');
    });
});
