import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const navigate = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('@constants/interactionRoutes', () => ({ DASHBOARD_HOME: '/dashboard' }));

const notifyError = vi.fn();
vi.mock('@hooks/useNotifyError', () => ({ useNotifyError: () => notifyError }));
vi.mock('@hooks/useTxErrorToast', () => ({ useTxErrorToast: vi.fn() }));

const levelUpPet = {
    mutate: vi.fn().mockResolvedValue(undefined),
    isPending: false,
    error: null,
    reset: vi.fn(),
    lifecycle: { phase: 'idle' },
};
let capturedOnSuccess: (() => void) | undefined;

const petList = {
    pets: [
        { id: '1', name: 'Alpha', level: 2 },
        { id: '2', name: 'Beta', level: 5 },
    ],
    refetch: vi.fn(),
};
const capabilities = { levelUpFee: null as { amount: number; symbol: string } | null };

vi.mock('@shared/core', () => ({
    useAuth: () => ({ isAuthenticated: true, isSigning: false, isVerifying: false, isNonceLoading: false, signAndLogin: vi.fn() }),
    getReadyPetsUnified: (pets: { id: string; level: number }[]) => pets.map((p) => ({ id: p.id, pet: p })),
    useChainCapabilities: () => capabilities,
    useFees: () => ({
        levelUpFee: undefined as bigint | undefined,
        symbol: null as 'ETH' | 'SOL' | null,
        formatAmount: (v: bigint) => `${v}`,
        formatAmountOnly: (v: bigint) => String(v),
    }),
    usePetList: () => petList,
    useLevelUpPet: (opts: { onSuccess?: () => void }) => {
        capturedOnSuccess = opts?.onSuccess;
        return levelUpPet;
    },
}));

import LevelUpPanel from '@components/pet/interactions/panels/level-up';

beforeEach(() => {
    vi.clearAllMocks();
    capabilities.levelUpFee = null;
    levelUpPet.isPending = false;
});

describe('LevelUpPanel', () => {
    it('lists the ready pets as options', () => {
        render(<LevelUpPanel />);
        expect(screen.getByRole('option', { name: 'Alpha (Level 2)' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'Beta (Level 5)' })).toBeInTheDocument();
    });

    it('labels the button with the fee when one is configured', () => {
        capabilities.levelUpFee = { amount: 5, symbol: 'SOL' };
        render(<LevelUpPanel />);
        expect(screen.getByRole('button', { name: 'Level Up (from 5 SOL)' })).toBeInTheDocument();
    });

    it('falls back to a plain label with no fee', () => {
        render(<LevelUpPanel />);
        expect(screen.getByRole('button', { name: 'Level Up' })).toBeInTheDocument();
    });

    it('keeps the submit disabled until a pet is selected', async () => {
        render(<LevelUpPanel />);
        const submit = screen.getByRole('button', { name: 'Level Up' });
        expect(submit).toBeDisabled();

        await userEvent.selectOptions(screen.getByRole('combobox'), '2');
        expect(submit).toBeEnabled();
    });

    it('submits the level-up mutation for the chosen pet', async () => {
        render(<LevelUpPanel />);
        await userEvent.selectOptions(screen.getByRole('combobox'), '2');
        await userEvent.click(screen.getByRole('button', { name: 'Level Up' }));

        expect(levelUpPet.reset).toHaveBeenCalled();
        expect(levelUpPet.mutate).toHaveBeenCalledWith({ petId: '2' });
    });

    it('shows success once settled', () => {
        render(<LevelUpPanel />);

        act(() => {
            capturedOnSuccess?.();
        });

        expect(screen.getByText('Pet leveled up successfully!')).toBeInTheDocument();
        expect(petList.refetch).toHaveBeenCalled();
    });
});
