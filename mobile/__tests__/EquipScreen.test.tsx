/**
 * Gearing a pet (roadmap section 4).
 *
 * Three slots are always drawn, filled or not: an empty slot is information, and
 * rendering only what is equipped makes a bare pet look like a pet with no slots.
 *
 * The choices per slot come from the bag rather than a second query, and the filter is
 * the part worth pinning: a consumable, a slotless item and a spent stack all have to
 * stay out, or the player is offered something the contract will reject.
 *
 * `@shared/core` is stubbed — its barrel drags the Solana runtime into jest.
 */

import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

const gear = (over: Record<string, unknown> = {}) => ({
    itemType: '10',
    key: 'rusty_dagger',
    category: 'equipment',
    slot: 0,
    rarity: 1,
    effect: { kind: 'stat_bonus', hp: 0, atk: 4, def: 0, int: 0, mdef: 0 },
    name: 'Rusty Dagger',
    description: 'A dagger.',
    ...over,
});

const mockState = {
    entries: [] as { item: ReturnType<typeof gear>; quantity: string }[],
    bySlot: new Map<number, { slot: number; item: ReturnType<typeof gear> }>(),
    slotsLoading: false,
    canEquip: true,
    isConnected: true,
};

const mockEquip = jest.fn();
const mockUnequip = jest.fn();
const mockNotify = jest.fn();
/** Which pet the slots are read for; the whole point of following the route param. */
const mockEquipmentPetId = jest.fn();

/**
 * A marker rather than null, so the bag can be asserted to draw item art. Nulling it
 * would let the art vanish again unnoticed, which is how the gallery shipped without
 * pet avatars for the whole project.
 */
jest.mock('../src/components/ItemArt', () => {
    const { Text: RNText } = jest.requireActual('react-native');
    const React_ = jest.requireActual('react');
    return ({ item }: { item: { itemType: string } }) =>
        React_.createElement(RNText, null, `[item-art:${item.itemType}]`);
});

jest.mock('../src/components/PetArt', () => () => null);

jest.mock('@shared/core', () => ({
    SLOT: { weapon: 0, armor: 1, trinket: 2 },
    useChainCapabilities: () => ({
        activeKind: 'ethereum',
        isConnected: mockState.isConnected,
    }),
    usePetList: () => ({ pets: [{ id: '1', name: 'Rex', level: 2 }] }),
    useInventory: () => ({ entries: mockState.entries }),
    usePetEquipment: (opts: { petId: string | null }) => {
        mockEquipmentPetId(opts.petId);
        return {
            equipped: [...mockState.bySlot.values()],
            bySlot: mockState.bySlot,
            isLoading: mockState.slotsLoading,
            isSuccess: true,
            error: null,
            refetch: jest.fn(),
        };
    },
    useEquipItem: () => ({
        canEquip: mockState.canEquip,
        equip: mockEquip,
        unequip: mockUnequip,
        equipLifecycle: { error: null },
        unequipLifecycle: { error: null },
        isPending: false,
    }),
    getRarityColor: () => '#ffffff',
    describeItemEffect: () => '+4 ATK',
}));

jest.mock('../src/hooks/useNotifyError', () => ({ useNotifyError: () => mockNotify }));
jest.mock('../src/hooks/useTxErrorToast', () => ({ useTxErrorToast: () => {} }));
const mockRouteParams: { petId?: string } = { petId: '1' };
jest.mock('@react-navigation/native', () => ({ useRoute: () => ({ params: mockRouteParams }) }));

import EquipScreen from '../src/screens/EquipScreen';

const render = async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
        tree = ReactTestRenderer.create(<EquipScreen />);
    });
    return tree;
};

const textOf = (tree: ReactTestRenderer.ReactTestRenderer): string =>
    tree.root
        .findAllByType(Text)
        .map((node) => {
            const walk = (c: unknown): string =>
                typeof c === 'string' || typeof c === 'number'
                    ? String(c)
                    : Array.isArray(c)
                      ? c.map(walk).join('')
                      : '';
            return walk(node.props.children);
        })
        .join(' | ');

const press = async (tree: ReactTestRenderer.ReactTestRenderer, label: string) => {
    const node = tree.root
        .findAllByType(TouchableOpacity)
        .find((n) => n.props.accessibilityLabel === label);
    await ReactTestRenderer.act(async () => node!.props.onPress());
};

const labels = (tree: ReactTestRenderer.ReactTestRenderer): unknown[] =>
    tree.root.findAllByType(TouchableOpacity).map((n) => n.props.accessibilityLabel);

beforeEach(() => {
    mockState.entries = [{ item: gear(), quantity: '1' }];
    mockState.bySlot = new Map();
    mockState.slotsLoading = false;
    mockState.canEquip = true;
    mockState.isConnected = true;
    mockRouteParams.petId = '1';
    mockEquipmentPetId.mockClear();
    jest.clearAllMocks();
});

describe('slots', () => {
    it('draws all three whether filled or not', async () => {
        const tree = await render();
        const rendered = textOf(tree);
        expect(rendered).toContain('Weapon');
        expect(rendered).toContain('Armor');
        expect(rendered).toContain('Trinket');
    });

    it('offers removal for a filled slot and nothing to equip into it', async () => {
        mockState.bySlot = new Map([[0, { slot: 0, item: gear() }]]);
        const tree = await render();
        expect(labels(tree)).toContain('Unequip Weapon');
        expect(labels(tree)).not.toContain('Equip Weapon');
    });

    it('draws art for both a worn item and the choices offered', async () => {
        mockState.bySlot = new Map([[0, { slot: 0, item: gear({ itemType: '10' }) }]]);
        mockState.entries = [{ item: gear({ itemType: '11', slot: 1, name: 'Hide Vest' }), quantity: '1' }];
        const tree = await render();

        expect(textOf(tree)).toContain('[item-art:10]'); // worn
        expect(textOf(tree)).toContain('[item-art:11]'); // offered
    });

    it('says an empty slot has nothing that fits, distinct from having no slot', async () => {
        mockState.entries = [];
        const tree = await render();
        expect(textOf(tree)).toContain('nothing in the bag fits this slot');
    });
});

describe('what can go in a slot', () => {
    it('keeps consumables and slotless items out', async () => {
        mockState.entries = [
            { item: gear(), quantity: '1' },
            { item: gear({ itemType: '11', name: 'Potion', category: 'consumable', slot: null }), quantity: '5' },
            { item: gear({ itemType: '12', name: 'Badge', category: 'collectible', slot: null }), quantity: '1' },
        ];
        const tree = await render();
        expect(labels(tree)).toContain('Choose Rusty Dagger');
        expect(labels(tree)).not.toContain('Choose Potion');
        expect(labels(tree)).not.toContain('Choose Badge');
    });

    it('keeps a spent stack out, since zero is written rather than deleted', async () => {
        mockState.entries = [{ item: gear(), quantity: '0' }];
        const tree = await render();
        expect(labels(tree)).not.toContain('Choose Rusty Dagger');
        expect(textOf(tree)).toContain('nothing in the bag fits this slot');
    });
});

describe('committing', () => {
    it('equips the chosen item into its slot', async () => {
        const tree = await render();
        await press(tree, 'Choose Rusty Dagger');
        await press(tree, 'Equip Weapon');
        expect(mockEquip).toHaveBeenCalledWith(0, '10');
    });

    it('unequips by slot', async () => {
        mockState.bySlot = new Map([[0, { slot: 0, item: gear() }]]);
        const tree = await render();
        await press(tree, 'Unequip Weapon');
        expect(mockUnequip).toHaveBeenCalledWith(0);
    });

    it('refuses while disconnected rather than sending a call that cannot be signed', async () => {
        mockState.isConnected = false;
        const tree = await render();
        await press(tree, 'Choose Rusty Dagger');
        await press(tree, 'Equip Weapon');
        expect(mockEquip).not.toHaveBeenCalled();
        expect(mockNotify).toHaveBeenCalledWith(
            'Connect your wallet first',
            undefined,
            'equip-validation',
        );
    });

    it('follows a second pet arriving from another card', async () => {
        // Navigating to a screen already on the stack reuses the mounted instance, so a
        // `useState` initializer never sees the new pet. Battle had the same bug with
        // worse reach, because a tab never unmounts at all.
        const tree = await render();
        mockRouteParams.petId = '2';
        await ReactTestRenderer.act(async () => {
            tree.update(<EquipScreen />);
        });

        // The slots are read for pet 2 now. Asserting the argument rather than the
        // rendering is what makes this fail when the param is ignored: the screen looks
        // identical either way, it just describes the wrong pet.
        expect(mockEquipmentPetId).toHaveBeenLastCalledWith('2');
    });

    it('says why on a chain with no item contract, rather than showing a dead button', async () => {
        mockState.canEquip = false;
        const tree = await render();
        expect(textOf(tree)).toContain('no item contract');
    });
});
