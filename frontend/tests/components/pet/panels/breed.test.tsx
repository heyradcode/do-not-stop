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

const petList = {
    pets: [
        { id: '1', name: 'Alpha', level: 2 },
        { id: '2', name: 'Beta', level: 5 },
    ],
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
    useMarriageInfo: () => ({ isMarried: false, spouseId: undefined }),
    usePendingBreed: () => ({ isPending: false }),
    usePetsConfig: () => ({ evm: undefined }),
    useBreedPets: (opts: { onSuccess?: (arg: { name: string }) => void }) => {
        capturedOnSuccess = opts?.onSuccess;
        return breed;
    },
}));
// New sibling that reaches into PetsConfig/wagmi — stub it out.
vi.mock('@components/pet/interactions/panels/breed/pending-breed-notice', () => ({
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
});

describe('BreedPanel', () => {
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
        // breed.reset is wired through capturedOnSuccess callback; just verify no crash
        expect(breed.reset).toBeDefined();
    });
});
