import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const useChainCapabilities = vi.fn();
const useInventory = vi.fn();
const usePendingItems = vi.fn();
const usePetList = vi.fn();
const useSpendItem = vi.fn();
const useAuth = vi.fn();
const navigate = vi.fn();

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return { ...actual, useNavigate: () => navigate };
});

vi.mock('@shared/core', () => ({
    useAuth: () => useAuth(),
    useChainCapabilities: () => useChainCapabilities(),
    useInventory: (opts: unknown) => useInventory(opts),
    usePendingItems: (chain: unknown) => usePendingItems(chain),
    usePetList: () => usePetList(),
    useSpendItem: () => useSpendItem(),
    // The real ones: the five rarity tiers and the effect wording are shared with the pet
    // cards on purpose, so a test that stubbed them would stop checking that.
    getRarityColor: (r: number) => ['#8B4513', '#C0C0C0', '#FFD700', '#FF69B4', '#8A2BE2'][r - 1] ?? '#8B4513',
    getRarityName: (r: number) =>
        ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'][r - 1] ?? 'Unknown',
    SLOT_NAMES: { 0: 'weapon', 1: 'armor', 2: 'trinket' },
    // Null: no image service configured, so ItemArt renders nothing and these cases stay
    // about grouping and labelling. The art has its own suite in components/item.
    itemArtUrl: () => null,
    itemFallbackArtUrl: () => null,
    describeItemEffect: (effect: { kind: string; amount?: number; atk?: number } | null) => {
        if (!effect) return null;
        if (effect.kind === 'grant_xp') return `Grants ${effect.amount} XP`;
        if (effect.kind === 'stat_bonus') return `+${effect.atk} ATK`;
        return 'Clears the battle cooldown';
    },
}));

import Inventory from '@components/inventory';

const POTION = {
    itemType: '100',
    key: 'xp_potion_i',
    category: 'consumable',
    slot: null,
    rarity: 1,
    effect: { kind: 'grant_xp', amount: 50 },
    name: 'Lesser Tonic',
    description: 'Tastes of copper.',
};

const BLADE = {
    itemType: '1',
    key: 'iron_fang',
    category: 'equipment',
    slot: 0,
    rarity: 3,
    effect: { kind: 'stat_bonus', atk: 4 },
    name: 'Iron Fang',
    description: 'A blunt starter blade.',
};

const SHARD = {
    ...POTION,
    itemType: '300',
    key: 'ember_shard',
    category: 'material',
    effect: null,
    name: 'Ember Shard',
};

const spend = vi.fn();

function renderBag() {
    return render(
        <MemoryRouter initialEntries={['/inventory']}>
            <Inventory />
        </MemoryRouter>,
    );
}

beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({ isAuthenticated: true, isConnected: true });
    useChainCapabilities.mockReturnValue({ activeKind: 'evm', isConnected: true, chainLabel: 'EVM' });
    useInventory.mockReturnValue({ entries: [], isLoading: false, error: null, refetch: vi.fn() });
    usePendingItems.mockReturnValue({ pending: [], claim: vi.fn(), claimingId: null, claimError: null });
    usePetList.mockReturnValue({ pets: [{ id: '7', name: 'Rex' }] });
    useSpendItem.mockReturnValue({ spend, isPending: false, error: null, reset: vi.fn() });
    spend.mockResolvedValue({ burnTxHash: '0xburn', level: 5, xp: 0, readyAt: 0, leveledUp: false });
});

describe('the bag', () => {
    it('tells a player with nothing where items come from', () => {
        renderBag();
        expect(screen.getByText(/Items drop from battles/i)).toBeInTheDocument();
    });

    // The grouping is the design: the categories are what a player can *do* with a thing,
    // so they have to survive as headings rather than flattening into one grid.
    it('groups items under their category', () => {
        useInventory.mockReturnValue({
            entries: [
                { item: POTION, quantity: '3' },
                { item: BLADE, quantity: '1' },
                { item: SHARD, quantity: '9' },
            ],
            isLoading: false,
            error: null,
            refetch: vi.fn(),
        });

        renderBag();

        expect(screen.getByRole('heading', { name: 'Consumables' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Equipment' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Materials' })).toBeInTheDocument();
        // Nothing in the collectible bucket, so it is not drawn at all.
        expect(screen.queryByRole('heading', { name: 'Collectibles' })).not.toBeInTheDocument();
    });

    // Rarity comes from the same helper the pet cards use, so the five tiers mean one thing
    // across the app rather than two.
    it('labels each item with its shared rarity tier and quantity', () => {
        useInventory.mockReturnValue({
            entries: [{ item: BLADE, quantity: '2' }],
            isLoading: false,
            error: null,
            refetch: vi.fn(),
        });

        renderBag();

        expect(screen.getByText('Rare')).toBeInTheDocument();
        expect(screen.getByText('×2')).toBeInTheDocument();
    });

    it('only offers Use on a consumable', () => {
        useInventory.mockReturnValue({
            entries: [
                { item: POTION, quantity: '1' },
                { item: BLADE, quantity: '1' },
                { item: SHARD, quantity: '1' },
            ],
            isLoading: false,
            error: null,
            refetch: vi.fn(),
        });

        renderBag();

        expect(screen.getAllByRole('button', { name: 'Use' })).toHaveLength(1);
    });

    it('spends the consumable on the selected pet', async () => {
        useInventory.mockReturnValue({
            entries: [{ item: POTION, quantity: '1' }],
            isLoading: false,
            error: null,
            refetch: vi.fn(),
        });

        renderBag();
        await userEvent.click(screen.getByRole('button', { name: 'Use' }));

        expect(spend).toHaveBeenCalledWith({ chain: 'evm', petId: '7', itemType: '100' });
    });

    // Equipping is a wallet signature against one pet, so the bag sends the player to the
    // pet rather than offering a button that cannot work here.
    it('sends equipment to the equip screen instead of acting on it', async () => {
        useInventory.mockReturnValue({
            entries: [{ item: BLADE, quantity: '1' }],
            isLoading: false,
            error: null,
            refetch: vi.fn(),
        });

        renderBag();
        await userEvent.click(screen.getByRole('button', { name: /Equip on a pet/ }));

        expect(navigate).toHaveBeenCalledWith('/equip');
        expect(spend).not.toHaveBeenCalled();
    });

    it('surfaces a read failure rather than rendering an empty bag', () => {
        useInventory.mockReturnValue({
            entries: [],
            isLoading: false,
            error: new Error('boom'),
            refetch: vi.fn(),
        });

        renderBag();

        expect(screen.getByRole('alert')).toHaveTextContent('boom');
    });
});

describe('items waiting to be claimed', () => {
    const pending = {
        entitlementId: 'e1',
        item: POTION,
        quantity: 2,
        source: 'battle_drop',
        sourceRef: 'btl_0001',
        createdAt: '2026-08-07T00:00:00.000Z',
    };

    // Their own strip above the bag, because they are not items yet: claiming is what mints
    // them, and until then there is nothing on chain to spend.
    it('shows them apart from the bag, with what paid them', () => {
        usePendingItems.mockReturnValue({ pending: [pending], claim: vi.fn(), claimingId: null, claimError: null });

        renderBag();

        const strip = screen.getByRole('region', { name: /Waiting to be claimed/i });
        expect(within(strip).getByText(/Lesser Tonic ×2/)).toBeInTheDocument();
        expect(within(strip).getByText('Battle drop')).toBeInTheDocument();
    });

    it('claims the entitlement it was asked about', async () => {
        const claim = vi.fn();
        usePendingItems.mockReturnValue({ pending: [pending], claim, claimingId: null, claimError: null });

        renderBag();
        await userEvent.click(screen.getByRole('button', { name: 'Claim' }));

        expect(claim).toHaveBeenCalledWith('e1');
    });

    // One claim at a time: each sends a transaction from the backend's wallet, and a player
    // hammering three buttons should not queue three mints.
    it('disables every claim while one is in flight', () => {
        usePendingItems.mockReturnValue({
            pending: [pending, { ...pending, entitlementId: 'e2' }],
            claim: vi.fn(),
            claimingId: 'e1',
            claimError: null,
        });

        renderBag();

        expect(screen.getByRole('button', { name: 'Claiming…' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Claim' })).toBeDisabled();
    });
});
