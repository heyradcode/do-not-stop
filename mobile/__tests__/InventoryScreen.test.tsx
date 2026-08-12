/**
 * The bag, and the two things about it that are easy to get wrong.
 *
 * Quantity zero is a value rather than an absence: `indexer-go` resumes from an
 * `updatedAt` watermark, so a spent stack is written as `quantity 0` instead of being
 * deleted. A row reading zero has to disappear from the bag, not show as a held item.
 *
 * A pending drop is not an item yet. Nothing on chain reflects one until its claim
 * lands, so it cannot be offered anywhere an item can be spent.
 *
 * `@shared/core` is stubbed — its barrel drags the Solana runtime into jest.
 */

import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

const item = (over: Record<string, unknown> = {}) => ({
    itemType: '1',
    key: 'xp_potion_i',
    category: 'consumable',
    slot: null,
    rarity: 1,
    effect: { kind: 'grant_xp', amount: 50 },
    name: 'XP Potion',
    description: 'A small potion.',
    ...over,
});

const mockState = {
    entries: [] as { item: ReturnType<typeof item>; quantity: string }[],
    pending: [] as Record<string, unknown>[],
    isLoading: false,
    error: null as Error | null,
    claimingId: null as string | null,
};

const mockClaim = jest.fn();
const mockSpend = jest.fn();
const mockRefetch = jest.fn();
const mockNotify = jest.fn();

/**
 * A marker rather than null, so the bag can be asserted to draw item art. Nulling it
 * would let the art vanish again unnoticed, which is how the gallery shipped without
 * pet avatars for the whole project.
 */
jest.mock('../src/components/ItemArt', () => {
    const { Text: RNText } = jest.requireActual('react-native');
    const React_ = jest.requireActual('react');
    return ({ item: subject }: { item: { itemType: string } }) =>
        React_.createElement(RNText, null, `[item-art:${subject.itemType}]`);
});

jest.mock('../src/components/PetArt', () => () => null);

jest.mock('@shared/core', () => ({
    useChainCapabilities: () => ({ activeKind: 'ethereum', isConnected: true }),
    useInventory: () => ({
        entries: mockState.entries,
        isLoading: mockState.isLoading,
        error: mockState.error,
        refetch: mockRefetch,
    }),
    usePendingItems: () => ({
        pending: mockState.pending,
        isLoading: false,
        error: null,
        claim: mockClaim,
        claimingId: mockState.claimingId,
        claimError: null,
    }),
    usePetList: () => ({ pets: [{ id: '1', name: 'Rex', level: 2 }] }),
    useSpendItem: () => ({ spend: mockSpend, isPending: false, error: null, reset: jest.fn() }),
    getRarityColor: () => '#ffffff',
    describeItemEffect: () => 'Grants 50 XP',
    explainItem: () => 'Used on one of your pets.',
    itemStats: () => [{ label: 'XP', value: 50 }],
    SLOT_NAMES: { 0: 'weapon', 1: 'armor', 2: 'trinket' },
}));

jest.mock('../src/hooks/useNotifyError', () => ({ useNotifyError: () => mockNotify }));

import InventoryScreen from '../src/screens/InventoryScreen';

const render = async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
        tree = ReactTestRenderer.create(<InventoryScreen />);
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

beforeEach(() => {
    mockState.entries = [{ item: item(), quantity: '3' }];
    mockState.pending = [];
    mockState.isLoading = false;
    mockState.error = null;
    mockState.claimingId = null;
    mockSpend.mockResolvedValue({ burnTxHash: '0x', level: 3, xp: 120, readyAt: 0, leveledUp: true });
    jest.clearAllMocks();
});

describe('the bag', () => {
    it('lists a held stack with its quantity', async () => {
        const tree = await render();
        expect(textOf(tree)).toContain('XP Potion');
        expect(textOf(tree)).toContain('×3');
    });

    it('draws each item with its art, not a coloured tile alone', async () => {
        // Without it a legendary sword and a crafting shard look alike: both are a name
        // on a rarity-tinted rectangle.
        mockState.entries = [{ item: item({ itemType: '42' }), quantity: '1' }];
        const tree = await render();
        expect(textOf(tree)).toContain('[item-art:42]');
    });

    it('hides a spent stack, since zero is written rather than deleted', async () => {
        mockState.entries = [{ item: item(), quantity: '0' }];
        const tree = await render();
        expect(textOf(tree)).not.toContain('XP Potion');
        expect(textOf(tree)).toContain('Nothing here yet');
    });

    it('reports an error instead of an empty bag', async () => {
        mockState.error = new Error('backend unreachable');
        const tree = await render();
        expect(textOf(tree)).toContain('backend unreachable');
        expect(textOf(tree)).not.toContain('Nothing here yet');
    });
});

describe('unclaimed drops', () => {
    it('keeps them out of the bag, since nothing on chain reflects one yet', async () => {
        mockState.entries = [];
        mockState.pending = [
            { entitlementId: 'e1', item: item({ name: 'Rusty Dagger' }), quantity: 1, source: 'battle_drop', sourceRef: '7', createdAt: '' },
        ];
        const tree = await render();

        expect(textOf(tree)).toContain('Rusty Dagger');
        expect(textOf(tree)).toContain('battle #7');
        // The bag itself is still empty: a pending drop is not a held item.
        expect(textOf(tree)).toContain('Nothing here yet');
    });

    it('claims by entitlement id', async () => {
        mockState.pending = [
            { entitlementId: 'e1', item: item({ name: 'Rusty Dagger' }), quantity: 1, source: 'admin_grant', sourceRef: '', createdAt: '' },
        ];
        const tree = await render();
        await press(tree, 'Claim Rusty Dagger');
        expect(mockClaim).toHaveBeenCalledWith('e1');
    });

    it('surfaces a failed claim rather than leaving the row looking slow', async () => {
        mockClaim.mockRejectedValueOnce(new Error('out of gas'));
        mockState.pending = [
            { entitlementId: 'e1', item: item({ name: 'Rusty Dagger' }), quantity: 1, source: 'admin_grant', sourceRef: '', createdAt: '' },
        ];
        const tree = await render();
        await press(tree, 'Claim Rusty Dagger');
        expect(mockNotify).toHaveBeenCalledWith(
            'Could not claim Rusty Dagger',
            expect.any(Error),
            'inventory-claim',
        );
    });
});

describe('spending a consumable', () => {
    it('refuses without a pet rather than sending a call that cannot work', async () => {
        const tree = await render();
        await press(tree, 'Open XP Potion');
        await press(tree, 'Use item');
        expect(mockSpend).not.toHaveBeenCalled();
        expect(mockNotify).toHaveBeenCalledWith(
            'Pick a pet to use this on',
            undefined,
            'inventory-validation',
        );
    });

    it('spends on the chosen pet and refreshes the bag', async () => {
        const tree = await render();
        await press(tree, 'Open XP Potion');

        // PetPicker renders one chip per pet; the first is Rex.
        const chip = tree.root
            .findAllByType(TouchableOpacity)
            .find((n) => textOf({ root: n } as never).includes('Rex'));
        await ReactTestRenderer.act(async () => chip!.props.onPress());
        await press(tree, 'Use item');

        expect(mockSpend).toHaveBeenCalledWith({
            chain: 'ethereum',
            petId: '1',
            itemType: '1',
        });
        expect(mockRefetch).toHaveBeenCalled();
        expect(textOf(tree)).toContain('Level 3');
    });
});
