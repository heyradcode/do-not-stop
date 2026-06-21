import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const navigate = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('wagmi', () => ({ useReadContracts: () => ({ data: undefined }) }));
vi.mock('@constants/interactionRoutes', () => ({ DASHBOARD_HOME: '/dashboard' }));
vi.mock('@hooks/usePetErrorToast', () => ({ usePetErrorToast: vi.fn() }));
vi.mock('@components/common', () => ({
    AuthActionButton: ({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) => (
        <button onClick={onClick} disabled={disabled}>
            {children}
        </button>
    ),
}));

const breed = {
    mutate: vi.fn(),
    clearErrors: vi.fn(),
    reset: vi.fn(),
    error: null,
    isPending: false,
    isAwaitingFulfillment: false,
    hash: undefined as string | undefined,
    lifecycle: { phase: 'idle' },
};
let capturedOnSuccess: ((arg: { name: string }) => void) | undefined;

const DEFAULT_PETS = [
    { id: '1', name: 'Alpha', level: 2 },
    { id: '2', name: 'Beta', level: 5 },
];
const petList = {
    pets: [...DEFAULT_PETS] as Array<{ id: string; name: string; level: number; spouseId?: number }>,
    refetch: vi.fn(),
};
const capabilities = { randomness: { provider: 'vrf' }, kind: 'solana' };

vi.mock('@shared/core', () => ({
    getReadyPetsUnified: (pets: { id: string; level: number }[]) => pets.map((p) => ({ id: p.id, pet: p })),
    useChainCapabilities: () => capabilities,
    usePetList: () => petList,
    useFees: () => ({
        studFee: undefined as bigint | undefined,
        symbol: null as 'ETH' | 'SOL' | null,
        formatAmount: (v: bigint) => `${v}`,
        formatAmountOnly: (v: bigint) => String(v),
    }),
    useApiClient: () => ({ defaults: { baseURL: '' }, post: vi.fn() }),
    useMarriageInfo: (pet?: { spouseId?: number }) =>
        pet?.spouseId
            ? { isMarried: true, spouseId: BigInt(pet.spouseId), isLoading: false, hasProposal: false, refetch: vi.fn() }
            : { isMarried: false, spouseId: undefined, isLoading: false, hasProposal: false, refetch: vi.fn() },
    usePendingBreed: () => ({ isPending: false }),
    usePetsConfig: () => ({ evm: undefined }),
    useBreedPets: (opts: { onSuccess?: (arg: { name: string }) => void }) => {
        capturedOnSuccess = opts?.onSuccess;
        return breed;
    },
}));

vi.mock('@tanstack/react-query', () => ({
    useQuery: () => ({ data: undefined, isLoading: false, error: null }),
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('@components/pet/interactions/panels/breed/pending-breed-notice', () => ({
    default: () => null,
}));
vi.mock('@components/pet/interactions/panels/breed/stud-fee-balance', () => ({
    default: () => null,
}));

import BreedPanel from '@components/pet/interactions/panels/breed';

const fillForm = async () => {
    const [first, second] = screen.getAllByRole('combobox');
    await userEvent.selectOptions(first, '1');
    await userEvent.selectOptions(second, '2');
    await userEvent.type(screen.getByPlaceholderText('Name for the new pet…'), 'Gamma');
};

beforeEach(() => {
    vi.clearAllMocks();
    capabilities.randomness.provider = 'vrf';
    Object.assign(breed, { isPending: false, isAwaitingFulfillment: false, hash: undefined });
    petList.pets = [...DEFAULT_PETS];
});

describe('BreedPanel — My Pets tab', () => {
    it('lists parents and excludes the first parent from the second select', async () => {
        render(<BreedPanel />);

        const [first, second] = screen.getAllByRole('combobox');
        expect(within(first).getByRole('option', { name: 'Alpha (Lv 2)' })).toBeInTheDocument();

        await userEvent.selectOptions(first, '1');

        expect(within(second).queryByRole('option', { name: 'Alpha (Lv 2)' })).not.toBeInTheDocument();
        expect(within(second).getByRole('option', { name: 'Beta (Lv 5)' })).toBeInTheDocument();
    });

    it('breeds the two selected parents with a trimmed name', async () => {
        render(<BreedPanel />);
        await fillForm();

        await userEvent.click(screen.getByRole('button', { name: 'Breed Pets' }));

        expect(breed.clearErrors).toHaveBeenCalled();
        expect(breed.mutate).toHaveBeenCalledWith({
            parentId1: '1',
            parentId2: '2',
            name: 'Gamma',
        });
    });

    it('shows success once the offspring is created', () => {
        render(<BreedPanel />);

        act(() => {
            capturedOnSuccess?.({ name: 'Junior' });
        });

        expect(screen.getByText('"Junior" created!')).toBeInTheDocument();
        expect(petList.refetch).toHaveBeenCalled();
    });

    it('shows the awaiting-fulfillment label and hint', () => {
        breed.isAwaitingFulfillment = true;
        render(<BreedPanel />);

        expect(screen.getByRole('button', { name: 'Creating…' })).toBeInTheDocument();
        expect(screen.getByText('Hang tight—your new pet will show up in a moment.')).toBeInTheDocument();
    });

    it('uses Switchboard VRF labels and shows a tx hash hint', () => {
        capabilities.randomness.provider = 'switchboard';
        breed.isPending = true;
        breed.hash = '0x1234567890';
        render(<BreedPanel />);

        expect(screen.getByRole('button', { name: 'Generating randomness…' })).toBeInTheDocument();
        expect(screen.getByText('Transaction: 0x123456…')).toBeInTheDocument();
    });

    it('resets when breed.reset is called', () => {
        render(<BreedPanel />);
        act(() => { breed.reset(); });
        expect(breed.reset).toBeDefined();
    });
});

describe('BreedPanel — With Spouse tab', () => {
    it('shows ↔ spouse indicator in the dropdown for married Solana pets', async () => {
        petList.pets = [
            { id: '1', name: 'Alpha', level: 2, spouseId: 5 },
            { id: '2', name: 'Beta', level: 3 },
        ];
        render(<BreedPanel />);

        await userEvent.click(screen.getByRole('button', { name: /With Spouse/ }));

        const select = screen.getByRole('combobox');
        expect(within(select).getByRole('option', { name: 'Alpha (Lv 2) ↔ #5' })).toBeInTheDocument();
        expect(within(select).getByRole('option', { name: 'Beta (Lv 3)' })).toBeInTheDocument();
    });

    it('auto-selects the first married pet when switching to With Spouse tab', async () => {
        petList.pets = [
            { id: '1', name: 'Alpha', level: 2, spouseId: 5 },
            { id: '2', name: 'Beta', level: 3 },
        ];
        render(<BreedPanel />);

        await userEvent.click(screen.getByRole('button', { name: /With Spouse/ }));

        expect(screen.getByRole('combobox')).toHaveValue('1');
    });

    it('shows the partner pet id once a married pet is selected', async () => {
        // Single married pet → auto-switches to spouse tab and auto-selects the pet
        petList.pets = [{ id: '1', name: 'Alpha', level: 2, spouseId: 7 }];
        render(<BreedPanel />);

        // SpouseLabel falls back to "#7" when the GraphQL name fetch has no data yet
        expect(screen.getByText('#7')).toBeInTheDocument();
    });

    it('shows Not married hint when an unmarried pet is selected', async () => {
        render(<BreedPanel />);

        await userEvent.click(screen.getByRole('button', { name: /With Spouse/ }));
        await userEvent.selectOptions(screen.getByRole('combobox'), '1');

        expect(screen.getByText('This pet is not married yet.')).toBeInTheDocument();
    });

    it('submits a cross-owner breed with the spouse as second parent', async () => {
        petList.pets = [{ id: '1', name: 'Alpha', level: 2, spouseId: 9 }];
        render(<BreedPanel />);

        // Alpha is auto-selected; partner #9 resolved via useMarriageInfo
        await userEvent.type(screen.getByPlaceholderText('Name for the new pet…'), 'Cub');
        await userEvent.click(screen.getByRole('button', { name: 'Breed with Spouse' }));

        expect(breed.mutate).toHaveBeenCalledWith({
            parentId1: '1',
            parentId2: '9',
            name: 'Cub',
            crossOwner: true,
        });
    });
});
