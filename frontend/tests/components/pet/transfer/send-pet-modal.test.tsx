import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const notifyError = vi.fn();
vi.mock('@hooks/useNotifyError', () => ({ useNotifyError: () => notifyError }));
vi.mock('@hooks/useTxErrorToast', () => ({ useTxErrorToast: vi.fn() }));

const isValid = vi.fn();
const capabilities = {
    address: { placeholder: '0x… address', label: 'Recipient address', isValid: (a: string) => isValid(a) },
    chainLabel: 'Ethereum',
    walletAddress: '0xself',
};
const transferPet = {
    mutate: vi.fn().mockResolvedValue(undefined),
    isPending: false,
    error: null,
    reset: vi.fn(),
    lifecycle: { phase: 'idle' },
};
let capturedOnSuccess: (() => void) | undefined;
const petList = { refetch: vi.fn() };

vi.mock('@shared/core', () => ({
    useChainCapabilities: () => capabilities,
    usePetList: () => petList,
    useTransferPet: (opts: { onSuccess?: () => void }) => {
        capturedOnSuccess = opts?.onSuccess;
        return transferPet;
    },
}));

import SendPetModal from '@components/pet/transfer/send-pet-modal';

const pet = { name: 'Sparky', dna: 123n, level: 4, rarity: 2 };
const renderModal = (isOpen = true, onClose = vi.fn()) => {
    render(<SendPetModal isOpen={isOpen} onClose={onClose} pet={pet} petId={7n} />);
    return onClose;
};

beforeEach(() => {
    vi.clearAllMocks();
    isValid.mockReturnValue(true);
    transferPet.isPending = false;
});

describe('SendPetModal', () => {
    it('renders nothing when closed', () => {
        const { container } = render(
            <SendPetModal isOpen={false} onClose={vi.fn()} pet={pet} petId={7n} />,
        );
        expect(container).toBeEmptyDOMElement();
    });

    it('shows the pet preview and recipient label when open', () => {
        renderModal();
        expect(screen.getByRole('heading', { name: 'Send Pet' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Sparky' })).toBeInTheDocument();
        expect(screen.getByText('123')).toBeInTheDocument();
        expect(screen.getByText('Recipient address')).toBeInTheDocument();
    });

    it('rejects an empty recipient', async () => {
        renderModal();
        await userEvent.type(screen.getByRole('textbox'), '   ');
        await userEvent.click(screen.getByRole('button', { name: 'Send Pet' }));

        expect(notifyError).toHaveBeenCalledWith(
            'Please enter a recipient address',
            undefined,
            'send-pet-validation',
        );
        expect(transferPet.mutate).not.toHaveBeenCalled();
    });

    it('rejects an address that fails chain validation', async () => {
        isValid.mockReturnValue(false);
        renderModal();
        await userEvent.type(screen.getByRole('textbox'), 'not-an-address');
        await userEvent.click(screen.getByRole('button', { name: 'Send Pet' }));

        expect(notifyError).toHaveBeenCalledWith(
            'Please enter a valid Ethereum address',
            undefined,
            'send-pet-validation',
        );
    });

    it('rejects sending a pet to yourself', async () => {
        renderModal();
        await userEvent.type(screen.getByRole('textbox'), '0xSELF');
        await userEvent.click(screen.getByRole('button', { name: 'Send Pet' }));

        expect(notifyError).toHaveBeenCalledWith(
            'You cannot send a pet to yourself',
            undefined,
            'send-pet-validation',
        );
    });

    it('transfers to a valid recipient', async () => {
        renderModal();
        await userEvent.type(screen.getByRole('textbox'), '0xrecipient');
        await userEvent.click(screen.getByRole('button', { name: 'Send Pet' }));

        expect(transferPet.mutate).toHaveBeenCalledWith({ to: '0xrecipient', petId: '7' });
    });

    it('refetches and closes once the transfer settles', () => {
        const onClose = renderModal();

        act(() => {
            capturedOnSuccess?.();
        });

        expect(petList.refetch).toHaveBeenCalled();
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('closes via the cancel button', async () => {
        const onClose = renderModal();
        await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(onClose).toHaveBeenCalledOnce();
    });
});
