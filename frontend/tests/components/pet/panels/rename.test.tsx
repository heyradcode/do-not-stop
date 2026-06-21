import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const navigate = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('@constants/interactionRoutes', () => ({ DASHBOARD_HOME: '/dashboard' }));

const notifyError = vi.fn();
vi.mock('@hooks/useNotifyError', () => ({ useNotifyError: () => notifyError }));
vi.mock('@hooks/useTxErrorToast', () => ({ useTxErrorToast: vi.fn() }));

const renamePet = {
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
const capabilities = { renameMinLevel: 1, isConnected: true };

vi.mock('@shared/core', () => ({
    getPetAvatar: () => '🐉',
    getPetClass: () => 'Warrior',
    getXpNumbers: () => ({ xpCurrent: 10, xpMax: 100 }),
    getXpPercent: () => 10,
    getReadyPetsUnified: (pets: { id: string; level: number }[]) => pets.map((p) => ({ id: p.id, pet: p })),
    useChainCapabilities: () => capabilities,
    usePetList: () => petList,
    useRenamePet: (opts: { onSuccess?: () => void }) => {
        capturedOnSuccess = opts?.onSuccess;
        return renamePet;
    },
}));

import RenamePanel from '@components/pet/interactions/panels/rename';

beforeEach(() => {
    vi.clearAllMocks();
    capabilities.renameMinLevel = 1;
    renamePet.isPending = false;
});

describe('RenamePanel', () => {
    it('lists the ready pets as options', () => {
        render(<RenamePanel />);

        expect(screen.getByRole('option', { name: 'Alpha (Level 2)' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'Beta (Level 5)' })).toBeInTheDocument();
    });

    it('filters out pets below the rename minimum level', () => {
        capabilities.renameMinLevel = 3;
        render(<RenamePanel />);

        expect(screen.queryByRole('option', { name: 'Alpha (Level 2)' })).not.toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'Beta (Level 5)' })).toBeInTheDocument();
    });

    it('keeps the submit button disabled until a pet and name are provided', async () => {
        render(<RenamePanel />);
        const submit = screen.getByRole('button', { name: 'Change Name' });
        expect(submit).toBeDisabled();

        await userEvent.selectOptions(screen.getByRole('combobox'), '1');
        await userEvent.type(screen.getByPlaceholderText('Enter new name...'), 'Gamma');

        expect(submit).toBeEnabled();
    });

    it('submits the rename mutation with the trimmed name', async () => {
        render(<RenamePanel />);

        await userEvent.selectOptions(screen.getByRole('combobox'), '1');
        await userEvent.type(screen.getByPlaceholderText('Enter new name...'), '  Gamma  ');
        await userEvent.click(screen.getByRole('button', { name: 'Change Name' }));

        expect(renamePet.reset).toHaveBeenCalled();
        expect(renamePet.mutate).toHaveBeenCalledWith({ petId: '1', name: 'Gamma' });
    });

    it('shows a success message once the rename settles', async () => {
        render(<RenamePanel />);
        await userEvent.selectOptions(screen.getByRole('combobox'), '1');
        await userEvent.type(screen.getByPlaceholderText('Enter new name...'), 'Gamma');

        act(() => {
            capturedOnSuccess?.();
        });

        expect(screen.getByText('Pet name changed to "Gamma"!')).toBeInTheDocument();
        expect(petList.refetch).toHaveBeenCalled();
    });
});
