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
    // No art service in these tests: PetArt renders the emoji alone.
    petArtUrl: () => null,
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

/**
 * Picks a pet from `PetSelect`: a trigger plus a portalled listbox, so the options exist
 * only once it is open and `selectOptions` does not apply.
 */
async function choosePet(name: string) {
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(await screen.findByRole('option', { name: new RegExp(name) }));
}

beforeEach(() => {
    vi.clearAllMocks();
    capabilities.renameMinLevel = 1;
    renamePet.isPending = false;
});

describe('RenamePanel', () => {
    it('lists the ready pets as options', async () => {
        render(<RenamePanel />);
        await userEvent.click(screen.getByRole('combobox'));

        expect(await screen.findByRole('option', { name: /Alpha/ })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: /Beta/ })).toBeInTheDocument();
        // The level rides beside the name rather than being folded into one string.
        expect(screen.getByRole('option', { name: /Lv 5/ })).toBeInTheDocument();
    });

    it('filters out pets below the rename minimum level', async () => {
        capabilities.renameMinLevel = 3;
        render(<RenamePanel />);
        await userEvent.click(screen.getByRole('combobox'));

        expect(screen.queryByRole('option', { name: /Alpha/ })).not.toBeInTheDocument();
        expect(await screen.findByRole('option', { name: /Beta/ })).toBeInTheDocument();
    });

    it('names the level requirement when it rules every pet out', () => {
        capabilities.renameMinLevel = 9;
        render(<RenamePanel />);

        expect(screen.getByText('No pets at level 9+')).toBeInTheDocument();
        expect(screen.getByRole('combobox')).toBeDisabled();
    });

    it('keeps the submit button disabled until a pet and name are provided', async () => {
        render(<RenamePanel />);
        const submit = screen.getByRole('button', { name: 'Change Name' });
        expect(submit).toBeDisabled();

        await choosePet('Alpha');
        await userEvent.type(screen.getByPlaceholderText('Enter new name...'), 'Gamma');

        expect(submit).toBeEnabled();
    });

    it('submits the rename mutation with the trimmed name', async () => {
        render(<RenamePanel />);

        await choosePet('Alpha');
        await userEvent.type(screen.getByPlaceholderText('Enter new name...'), '  Gamma  ');
        await userEvent.click(screen.getByRole('button', { name: 'Change Name' }));

        expect(renamePet.reset).toHaveBeenCalled();
        expect(renamePet.mutate).toHaveBeenCalledWith({ petId: '1', name: 'Gamma' });
    });

    it('shows a success message once the rename settles', async () => {
        render(<RenamePanel />);
        await choosePet('Alpha');
        await userEvent.type(screen.getByPlaceholderText('Enter new name...'), 'Gamma');

        act(() => {
            capturedOnSuccess?.();
        });

        expect(screen.getByText('Pet name changed to "Gamma"!')).toBeInTheDocument();
        expect(petList.refetch).toHaveBeenCalled();
    });
});
