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
import { ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import ReactTestRenderer from 'react-test-renderer';
import type { Pet } from '@shared/core';
/**
 * `useSafeAreaInsets` throws outside a `SafeAreaProvider`, and this suite renders a screen on
 * its own. The library ships this mock for exactly that. Repeated per suite rather than
 * registered globally: a global one needs a `setupFiles` entry pointing at a file whose name
 * says nothing about what it does.
 */
jest.mock('react-native-safe-area-context', () =>
    require('react-native-safe-area-context/jest/mock').default,
);


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

jest.mock('../src/components/PetArt', () => () => null);

jest.mock('@shared/core', () => ({
    // `PetPicker` shows the selected pet's stats inline now, so anything rendering a picker
    // reaches these. Real rather than stubbed: they are pure and dependency-free, and what a
    // pet reads here has to be what it reads on the card and on the web app.
    ...jest.requireActual('../../shared/src/utils/ethereum/petCard'),
    ...jest.requireActual('../../shared/src/utils/pets/skills'),
    ...jest.requireActual('../../shared/src/utils/pets/cosmetics'),
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

import { allText, type Tree } from './support/harness';

/** Every string on screen. The walk itself lives in the shared harness. */
const textOf = (tree: Tree) => allText(tree, ' | ');

const render = async (Screen: React.ComponentType) => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
        tree = ReactTestRenderer.create(<Screen />);
    });
    return tree;
};


/**
 * Found by `testID` rather than by position. It used to take the last touchable, which held
 * only because these three screens have no secondary button — Defense does, and the same
 * helper there was already pointing at the wrong control once the action bar moved out of
 * the scroll.
 */
const pressAction = async (tree: ReactTestRenderer.ReactTestRenderer) => {
    const node = tree.root
        .findAllByType(TouchableOpacity)
        .find((n) => n.props.testID === 'action-primary');
    await ReactTestRenderer.act(() => node!.props.onPress());
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

/**
 * The action bar's whole point is that it does not move.
 *
 * Rendered after `children` inside the `ScrollView`, the button's position tracked the height
 * of whatever the screen put above it: different on every screen, and below the fold on the
 * longer ones. These assert the structure that fixes it, because nothing else would notice it
 * sliding back in — every behavioural test above passes either way.
 */
describe('the fixed action bar', () => {
    const scrolls = (tree: ReactTestRenderer.ReactTestRenderer) =>
        tree.root.findAllByType(ScrollView);

    const primary = (tree: ReactTestRenderer.ReactTestRenderer) =>
        tree.root.findAllByType(TouchableOpacity).find((n) => n.props.testID === 'action-primary');

    it('keeps the action outside every scrollable region', async () => {
        const tree = await render(LevelUpScreen);
        const button = primary(tree);

        expect(button).toBeDefined();
        for (const scroll of scrolls(tree)) {
            expect(scroll.findAll((n) => n === button)).toHaveLength(0);
        }
    });

    /**
     * Pinning the bar is what creates this problem: inside the scroll the content inset
     * handled it, and a bar sitting on the window's bottom edge does not. Both cases are
     * asserted because only the pair distinguishes a real inset read from a constant that
     * happens to match one device.
     */
    it('pads itself clear of whatever the device puts along the bottom edge', async () => {
        const gestureBar = await renderWithInsets(LevelUpScreen, 34);
        expect(paddingBottomOfBar(gestureBar)).toBe(34 + 12);

        const noInset = await renderWithInsets(LevelUpScreen, 0);
        expect(paddingBottomOfBar(noInset)).toBe(12);
    });

    it('renders the action even when the screen has no content of its own', async () => {
        mockState.pets = [];
        const tree = await render(LevelUpScreen);
        expect(primary(tree)).toBeDefined();
    });
});

/**
 * The global mock reads `SafeAreaInsetsContext` before falling back to zeroes, so a provider
 * is enough to stand in for a device with a gesture bar. No `SafeAreaProvider`: that measures
 * a native view, which does not exist here.
 */
const renderWithInsets = async (Screen: React.ComponentType, bottom: number) => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
        tree = ReactTestRenderer.create(
            <SafeAreaInsetsContext.Provider value={{ top: 0, left: 0, right: 0, bottom }}>
                <Screen />
            </SafeAreaInsetsContext.Provider>,
        );
    });
    return tree;
};

const paddingBottomOfBar = (tree: ReactTestRenderer.ReactTestRenderer): number | undefined => {
    const bar = tree.root.findAllByType(View).find((n) => n.props.testID === 'action-bar');
    return StyleSheet.flatten(bar!.props.style).paddingBottom as number | undefined;
};
