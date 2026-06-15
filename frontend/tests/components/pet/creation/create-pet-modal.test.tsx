import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@hooks/useNotifyError', () => ({ useNotifyError: () => vi.fn() }));
vi.mock('@hooks/useTxErrorToast', () => ({ useTxErrorToast: vi.fn() }));

const createPet = {
    mutate: vi.fn().mockResolvedValue(undefined),
    isPending: false,
    error: null,
    reset: vi.fn(),
    lifecycle: { phase: 'idle' },
};
let capturedOnSuccess: (() => void) | undefined;
const petList = { refetch: vi.fn() };
const capabilities = { isConnected: true, kind: 'solana' };

vi.mock('@shared/core', () => ({
    useChainCapabilities: () => capabilities,
    usePetList: () => petList,
    useEvmFees: () => ({ nextMintFee: null }),
    useCreatePet: (opts: { onSuccess?: () => void }) => {
        capturedOnSuccess = opts?.onSuccess;
        return createPet;
    },
}));

import CreatePetModal from '@components/pet/creation/create-pet-modal';

const renderModal = (isOpen = true, onClose = vi.fn()) => {
    render(<CreatePetModal isOpen={isOpen} onClose={onClose} />);
    return onClose;
};

beforeEach(() => {
    vi.clearAllMocks();
    capabilities.isConnected = true;
    createPet.isPending = false;
});

describe('CreatePetModal', () => {
    it('renders nothing when closed', () => {
        const { container } = render(<CreatePetModal isOpen={false} onClose={vi.fn()} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('shows the form when open', () => {
        renderModal();
        expect(screen.getByRole('heading', { name: /Create Your First Pet/ })).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Enter pet name...')).toBeInTheDocument();
    });

    it('keeps submit disabled without a name', () => {
        renderModal();
        expect(screen.getByRole('button', { name: 'Create Pet' })).toBeDisabled();
    });

    it('keeps submit disabled when the wallet is not connected', async () => {
        capabilities.isConnected = false;
        renderModal();
        await userEvent.type(screen.getByPlaceholderText('Enter pet name...'), 'Sparky');
        expect(screen.getByRole('button', { name: 'Create Pet' })).toBeDisabled();
    });

    it('creates a pet with the trimmed name', async () => {
        renderModal();
        await userEvent.type(screen.getByPlaceholderText('Enter pet name...'), '  Sparky  ');
        await userEvent.click(screen.getByRole('button', { name: 'Create Pet' }));

        expect(createPet.mutate).toHaveBeenCalledWith({ name: 'Sparky' });
    });

    it('shows success, refetches and closes once settled', async () => {
        const onClose = renderModal();
        await userEvent.type(screen.getByPlaceholderText('Enter pet name...'), 'Sparky');

        act(() => {
            capturedOnSuccess?.();
        });

        expect(screen.getByText('Pet "Sparky" created successfully!')).toBeInTheDocument();
        expect(petList.refetch).toHaveBeenCalled();
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('closes and resets via the close button', async () => {
        const onClose = renderModal();
        await userEvent.click(screen.getByRole('button', { name: '×' }));

        expect(createPet.reset).toHaveBeenCalled();
        expect(onClose).toHaveBeenCalledOnce();
    });
});
