// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

const mocks = vi.hoisted(() => ({
    notifyError: vi.fn(),
    navigate: vi.fn(),
}));

vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));
vi.mock('@constants/interactionRoutes', () => ({ DASHBOARD_HOME: '/dashboard' }));
vi.mock('@hooks/useNotifyError', () => ({ useNotifyError: () => mocks.notifyError }));
vi.mock('@hooks/useTxErrorToast', () => ({ useTxErrorToast: vi.fn() }));
vi.mock('@components/ui/icon', () => ({
    default: () => null,
    CheckIcon: () => null,
}));
vi.mock('@constants/tones', () => ({ Tones: { Emerald: 'emerald' } }));
vi.mock('@components/common/transaction-status', () => ({ default: () => null }));
vi.mock('viem', () => ({ formatEther: (v: bigint) => `${v}` }));

const train = {
    mutate: vi.fn(),
    isPending: false,
    error: null,
    reset: vi.fn(),
    lifecycle: { phase: 'idle' },
};
let capturedOnSuccess: (() => void) | undefined;
const petList = {
    pets: [{ id: '1', name: 'Rex', level: 3 }],
    refetch: vi.fn(),
};

vi.mock('@shared/core', () => ({
    getReadyPetsUnified: (pets: { id: string; level: number }[]) => pets.map((p) => ({ id: p.id, pet: p })),
    useChainCapabilities: () => ({ kind: 'evm' }),
    usePetList: () => petList,
    useEvmFees: () => ({ trainFee: 1000000000000000n }),
    useSolanaFees: () => ({ trainFeeLamports: undefined }),
    useTrainPet: (opts: { onSuccess?: () => void }) => {
        capturedOnSuccess = opts?.onSuccess;
        return train;
    },
}));

import TrainPanel from '@components/pet/interactions/panels/train';

beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(train, { isPending: false, error: null });
    petList.pets = [{ id: '1', name: 'Rex', level: 3 }];
    capturedOnSuccess = undefined;
});

describe('TrainPanel', () => {
    it('renders the pet selector', () => {
        render(<TrainPanel />);
        expect(screen.getByRole('combobox')).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'Rex (Level 3)' })).toBeInTheDocument();
    });

    it('disables the Train button when no pet is selected', () => {
        render(<TrainPanel />);
        expect(screen.getByRole('button', { name: 'Train' })).toBeDisabled();
    });

    it('calls mutate with the selected pet', async () => {
        render(<TrainPanel />);
        await userEvent.selectOptions(screen.getByRole('combobox'), '1');
        await userEvent.click(screen.getByRole('button', { name: /Train/ }));
        expect(train.mutate).toHaveBeenCalledWith({ petId: '1' });
    });

    it('shows success message and navigates home after training', () => {
        render(<TrainPanel />);
        act(() => { capturedOnSuccess?.(); });
        expect(screen.getByText('Pet trained successfully!')).toBeInTheDocument();
        expect(mocks.navigate).toHaveBeenCalledWith('/dashboard');
    });

    it('shows Training... label while pending', () => {
        train.isPending = true;
        render(<TrainPanel />);
        expect(screen.getByRole('button', { name: 'Training...' })).toBeInTheDocument();
    });

    it('navigates home on cancel', async () => {
        render(<TrainPanel />);
        await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(mocks.navigate).toHaveBeenCalledWith('/dashboard');
    });

    it('shows the train cost when a pet is selected and fee is available', async () => {
        render(<TrainPanel />);
        await userEvent.selectOptions(screen.getByRole('combobox'), '1');
        expect(screen.getByText(/Cost:/)).toBeInTheDocument();
    });
});
