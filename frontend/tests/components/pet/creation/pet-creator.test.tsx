import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const notifyError = vi.fn();
vi.mock('@hooks/useNotifyError', () => ({ useNotifyError: () => notifyError }));
vi.mock('@hooks/useTxErrorToast', () => ({ useTxErrorToast: vi.fn() }));

const createPet = {
    mutate: vi.fn().mockResolvedValue(undefined),
    isPending: false,
    error: null,
    lifecycle: { phase: 'idle' },
};
let capturedOnSuccess: (() => void) | undefined;
const petList = { refetch: vi.fn() };
const capabilities = { isConnected: true };

vi.mock('@shared/core', () => ({
    useChainCapabilities: () => capabilities,
    usePetList: () => petList,
    useCreatePet: (opts: { onSuccess?: () => void }) => {
        capturedOnSuccess = opts?.onSuccess;
        return createPet;
    },
}));

import PetCreator from '@components/pet/creation/pet-creator';

beforeEach(() => {
    vi.clearAllMocks();
    capabilities.isConnected = true;
    createPet.isPending = false;
});

describe('PetCreator', () => {
    it('prompts to connect when the wallet is disconnected', () => {
        capabilities.isConnected = false;
        render(<PetCreator />);

        expect(screen.getByText('Connect your wallet to start creating pets!')).toBeInTheDocument();
        expect(screen.queryByPlaceholderText('Enter pet name...')).not.toBeInTheDocument();
    });

    it('shows the form when connected, with submit gated on a name', async () => {
        render(<PetCreator />);

        const submit = screen.getByRole('button', { name: 'Create Pet' });
        expect(submit).toBeDisabled();

        await userEvent.type(screen.getByPlaceholderText('Enter pet name...'), 'Sparky');
        expect(submit).toBeEnabled();
    });

    it('creates a pet with the trimmed name', async () => {
        render(<PetCreator />);
        await userEvent.type(screen.getByPlaceholderText('Enter pet name...'), '  Sparky  ');
        await userEvent.click(screen.getByRole('button', { name: 'Create Pet' }));

        expect(createPet.mutate).toHaveBeenCalledWith({ name: 'Sparky' });
    });

    it('shows success and refetches once settled', async () => {
        render(<PetCreator />);
        await userEvent.type(screen.getByPlaceholderText('Enter pet name...'), 'Sparky');

        act(() => {
            capturedOnSuccess?.();
        });

        expect(screen.getByText('Pet "Sparky" created successfully!')).toBeInTheDocument();
        expect(petList.refetch).toHaveBeenCalled();
    });
});
