/**
 * Breeding, over the real `useBreedPanel` with `@shared/core` stubbed. The hook is
 * the ported logic and the part worth testing: tab auto-switching, the cross-owner
 * spouse path, and the guards that stop a doomed transaction being sent (relatives,
 * a pending breed, a missing spouse).
 */

import React from 'react';
import { Text, TextInput, TouchableOpacity } from 'react-native';
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
    solanaPending: false,
    solanaCanCancel: false,
    pets: [pet(), pet({ id: '2', name: 'Momo' })] as Pet[],
    areRelated: false,
    pendingIds: [] as string[],
    isMarried: false,
    spouseId: undefined as bigint | undefined,
    randomnessProvider: null as string | null,
    isPending: false,
    isAwaitingFulfillment: false,
};

const mockBreed = jest.fn();

jest.mock('../src/hooks/useTxErrorToast', () => ({ useTxErrorToast: () => {} }));

jest.mock('../src/components/PetArt', () => () => null);

const mockCancelSolana = jest.fn(async () => undefined);
const mockSettleBreed = jest.fn(async () => undefined);
const mockCancelBreed = jest.fn(async () => undefined);

jest.mock('@shared/core', () => ({
    /** Solana holds one outstanding request per owner, not one per parent. */
    usePendingSolanaBreed: () => ({
        isPending: mockState.solanaPending,
        canCancel: mockState.solanaCanCancel,
        cancel: { run: mockCancelSolana, isPending: false, error: null },
        refetch: jest.fn(),
    }),
    useStudFees: () => ({
        amountLamports: null,
        isLoading: false,
        withdraw: { run: jest.fn(), isPending: false, error: null },
        refetch: jest.fn(),
    }),
    usePetList: () => ({ pets: mockState.pets, isLoading: false, error: null, refetch: jest.fn() }),
    useChainCapabilities: () => ({
        randomness: { provider: mockState.randomnessProvider },
        activeKind: 'evm',
    }),
    useFees: () => ({ studFee: 500n, formatAmount: (v: bigint) => `${v} wei` }),
    useMarriageInfo: () => ({
        isLoading: false,
        isMarried: mockState.isMarried,
        spouseId: mockState.spouseId,
    }),
    useBreedRelationCheck: () => ({ areRelated: mockState.areRelated }),
    usePendingBreed: (id?: string) => ({
        isPending: id != null && mockState.pendingIds.includes(id),
        // The way out of a stuck breed. Without these the screen can detect one and
        // offer nothing, which is the bug this stub used to model faithfully.
        settle: { run: mockSettleBreed, isPending: false, error: null },
        cancel: { run: mockCancelBreed, isPending: false, error: null },
        refetch: jest.fn(),
    }),
    useBreedPets: () => ({
        mutate: mockBreed,
        isPending: mockState.isPending,
        isAwaitingFulfillment: mockState.isAwaitingFulfillment,
        error: null,
        clearErrors: jest.fn(),
        hash: '0xdeadbeefcafe',
        lifecycle: {},
    }),
}));

jest.mock('../src/hooks/usePetErrorToast', () => ({ usePetErrorToast: () => {} }));

import BreedScreen from '../src/screens/BreedScreen';

const render = async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
        tree = ReactTestRenderer.create(<BreedScreen />);
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

const press = async (tree: ReactTestRenderer.ReactTestRenderer, index: number) => {
    await ReactTestRenderer.act(async () => {
        tree.root.findAllByType(TouchableOpacity)[index].props.onPress();
    });
};

const pressLabel = async (tree: ReactTestRenderer.ReactTestRenderer, label: string) => {
    const node = tree.root
        .findAllByType(TouchableOpacity)
        .find((n) => n.props.accessibilityLabel === label);
    await ReactTestRenderer.act(async () => node!.props.onPress());
};

/**
 * By `testID`, not by taking the last touchable. That held only while the breed button was
 * the final thing in the scroll; it now lives in `ScreenActionBar`, and the next control
 * added after the bar would have silently pressed the wrong one.
 */
const breedButton = (tree: ReactTestRenderer.ReactTestRenderer) =>
    tree.root.findAllByType(TouchableOpacity).find((n) => n.props.testID === 'action-primary')!;

const pressBreed = async (tree: ReactTestRenderer.ReactTestRenderer) => {
    await ReactTestRenderer.act(async () => {
        breedButton(tree).props.onPress();
    });
};

const type = async (tree: ReactTestRenderer.ReactTestRenderer, value: string) => {
    await ReactTestRenderer.act(async () => {
        tree.root.findByType(TextInput).props.onChangeText(value);
    });
};

/**
 * Touchables are flat: two tab buttons, then the first picker's chips, then the
 * second picker's. The second picker drops whichever pet the first selected, so
 * its chips start after `pets.length` entries.
 */
const selectParent1 = async (tree: ReactTestRenderer.ReactTestRenderer) => press(tree, 2);
const selectParent2 = async (tree: ReactTestRenderer.ReactTestRenderer) =>
    press(tree, 2 + mockState.pets.length);

beforeEach(() => {
    mockState.solanaPending = false;
    mockState.solanaCanCancel = false;
    mockState.pets = [pet(), pet({ id: '2', name: 'Momo' })];
    mockState.areRelated = false;
    mockState.pendingIds = [];
    mockState.isMarried = false;
    mockState.spouseId = undefined;
    mockState.randomnessProvider = null;
    mockState.isPending = false;
    mockState.isAwaitingFulfillment = false;
    jest.clearAllMocks();
});

describe('BreedScreen — own pets', () => {
    it('breeds two owned pets with the trimmed child name', async () => {
        const tree = await render();
        await selectParent1(tree); // parent 1 → id 1
        await selectParent2(tree); // parent 2 list excludes id 1, so first chip is id 2
        await type(tree, '  Pup  ');
        await pressBreed(tree);
        expect(mockBreed).toHaveBeenCalledWith({ parentId1: '1', parentId2: '2', name: 'Pup' });
    });

    it('never offers the same pet as both parents', async () => {
        const tree = await render();
        await selectParent1(tree);
        // Second picker drops the chosen parent, so a pet cannot breed with itself.
        const names = textOf(tree);
        expect(names).toContain('Momo');
        await selectParent2(tree);
        await type(tree, 'Pup');
        await pressBreed(tree);
        const call = mockBreed.mock.calls[0][0];
        expect(call.parentId1).not.toEqual(call.parentId2);
    });

    it('blocks breeding relatives', async () => {
        mockState.areRelated = true;
        const tree = await render();
        await selectParent1(tree);
        await selectParent2(tree);
        await type(tree, 'Pup');
        await pressBreed(tree);
        expect(mockBreed).not.toHaveBeenCalled();
        expect(textOf(tree)).toContain('These two are related');
    });

    it('blocks while a breed is already pending for a parent', async () => {
        // This guard is the button's `disabled`, not a check inside `onBreed` —
        // same as frontend. Asserting `disabled` is what RN actually enforces;
        // calling `onPress` directly bypasses it and would send the doomed tx.
        mockState.pendingIds = ['1'];
        const tree = await render();
        await selectParent1(tree);
        await selectParent2(tree);
        await type(tree, 'Pup');
        expect(breedButton(tree).props.disabled).toBe(true);
        expect(textOf(tree)).toContain('A breed is already pending');
    });

    it('requires a child name', async () => {
        const tree = await render();
        await selectParent1(tree);
        await selectParent2(tree);
        await pressBreed(tree);
        expect(mockBreed).not.toHaveBeenCalled();
    });
});

describe('BreedScreen — with spouse', () => {
    it('auto-switches to the spouse tab when there is only one pet', async () => {
        // The My Pets tab needs two, so landing there with one is a dead end.
        mockState.pets = [pet()];
        const tree = await render();
        expect(textOf(tree)).toContain('Breed with Spouse');
    });

    it('sends the cross-owner flag and the spouse id', async () => {
        mockState.pets = [pet()];
        mockState.isMarried = true;
        mockState.spouseId = 42n;
        const tree = await render();
        await type(tree, 'Pup');
        await pressBreed(tree);
        expect(mockBreed).toHaveBeenCalledWith({
            parentId1: '1',
            parentId2: '42',
            name: 'Pup',
            crossOwner: true,
        });
    });

    it('will not breed an unmarried pet', async () => {
        mockState.pets = [pet()];
        mockState.isMarried = false;
        const tree = await render();
        await type(tree, 'Pup');
        await pressBreed(tree);
        expect(mockBreed).not.toHaveBeenCalled();
        expect(textOf(tree)).toContain('not married');
    });

    it('shows the stud fee once a marriage is confirmed', async () => {
        mockState.pets = [pet()];
        mockState.isMarried = true;
        mockState.spouseId = 42n;
        const tree = await render();
        expect(textOf(tree)).toContain('Stud fee: 500 wei');
    });
});

describe('BreedScreen — async randomness', () => {
    it('names the wait differently on a Switchboard chain', async () => {
        // Solana's commit/settle is visibly slower, so the label says why.
        mockState.randomnessProvider = 'switchboard';
        mockState.isPending = true;
        const tree = await render();
        expect(textOf(tree)).toContain('Generating randomness…');
    });

    it('says "Submitting…" where randomness is not client-visible', async () => {
        mockState.isPending = true;
        const tree = await render();
        expect(textOf(tree)).toContain('Submitting…');
    });

    it('explains that leaving during fulfillment is safe', async () => {
        mockState.isAwaitingFulfillment = true;
        const tree = await render();
        expect(textOf(tree)).toContain('Waiting for randomness');
    });
});

/**
 * Getting out of an interrupted breed.
 *
 * v2 breed is request then settle. If the settle never lands the parents stay pending
 * and cannot breed again — and the screen used to say "settle or cancel it first" while
 * offering neither, so the pets were stuck for good.
 */
describe('BreedScreen — recovering a stuck breed', () => {
    it('offers settle and cancel rather than naming them and stopping', async () => {
        mockState.pendingIds = ['1'];
        const tree = await render();
        // The per-pet query only runs for a selected parent, so nothing is pending
        // until one is chosen — the same shape the blocking test above relies on.
        await selectParent1(tree);

        const labels = tree.root
            .findAllByType(TouchableOpacity)
            .map((n) => n.props.accessibilityLabel);
        expect(labels).toContain('Settle pending breed');
        expect(labels).toContain('Cancel pending breed');
    });

    it('settles on tap', async () => {
        mockState.pendingIds = ['1'];
        const tree = await render();
        await selectParent1(tree);
        await pressLabel(tree, 'Settle pending breed');
        expect(mockSettleBreed).toHaveBeenCalled();
    });

    it('cancels on tap', async () => {
        mockState.pendingIds = ['1'];
        const tree = await render();
        await selectParent1(tree);
        await pressLabel(tree, 'Cancel pending breed');
        expect(mockCancelBreed).toHaveBeenCalled();
    });

    it('offers no settle on Solana, which resumes instead', async () => {
        // Solana's request has no settle step: a new attempt resumes it. Offering one
        // would ask for a transaction the program does not have.
        mockState.pendingIds = [];
        mockState.solanaPending = true;
        mockState.solanaCanCancel = false;
        const tree = await render();

        expect(textOf(tree)).toContain('will resume it');
        const labels = tree.root
            .findAllByType(TouchableOpacity)
            .map((n) => n.props.accessibilityLabel);
        expect(labels).not.toContain('Settle pending breed');
        // Cancel only once the randomness has expired.
        expect(labels).not.toContain('Cancel pending breed');
    });

    it('offers cancel on Solana once the randomness has expired', async () => {
        mockState.pendingIds = [];
        mockState.solanaPending = true;
        mockState.solanaCanCancel = true;
        const tree = await render();

        expect(textOf(tree)).toContain('Randomness has expired');
        await pressLabel(tree, 'Cancel pending breed');
        expect(mockCancelSolana).toHaveBeenCalled();
    });
});
