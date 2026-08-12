import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@tanstack/react-query', () => ({
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
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
/** The EVM async-mint flags, mutable so a test can leave one stuck on. */
const asyncFlags = { isAwaitingFulfillment: false, isSettling: false };
/** An outstanding Solana mint request, which blocks any further commit_mint. */
const pendingMint = {
    isPending: false,
    canCancel: false,
    cancel: { run: vi.fn().mockResolvedValue(undefined), isPending: false, error: null },
    refetch: vi.fn(),
};

vi.mock('@shared/core', () => ({
    useAuth: () => ({
        isAuthenticated: true,
        isSigning: false,
        isVerifying: false,
        isNonceLoading: false,
        signAndLogin: vi.fn(),
    }),
    useChainCapabilities: () => capabilities,
    usePetList: () => petList,
    useFees: () => ({
        nextMintFee: 10n,
        entropyFee: undefined as bigint | undefined,
        symbol: 'SOL' as 'ETH' | 'SOL' | null,
        formatAmount: () => '0.01 SOL',
        formatAmountOnly: (v: bigint) => String(v),
    }),
    useCreatePet: (opts: { onSuccess?: () => void }) => {
        capturedOnSuccess = opts?.onSuccess;
        return { ...createPet, ...asyncFlags };
    },
    usePendingSolanaMint: () => pendingMint,
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
    asyncFlags.isAwaitingFulfillment = false;
    asyncFlags.isSettling = false;
    capabilities.kind = 'solana';
    pendingMint.isPending = false;
    pendingMint.canCancel = false;
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
        expect(screen.getByRole('button', { name: /Create Pet/ })).toBeDisabled();
    });

    it('keeps submit disabled when the wallet is not connected', async () => {
        capabilities.isConnected = false;
        renderModal();
        await userEvent.type(screen.getByPlaceholderText('Enter pet name...'), 'Sparky');
        expect(screen.getByRole('button', { name: /Create Pet/ })).toBeDisabled();
    });

    it('creates a pet with the trimmed name', async () => {
        renderModal();
        await userEvent.type(screen.getByPlaceholderText('Enter pet name...'), '  Sparky  ');
        await userEvent.click(screen.getByRole('button', { name: /Create Pet/ }));

        expect(createPet.mutate).toHaveBeenCalledWith({ name: 'Sparky' });
    });

    // Art is generated on first request, so closing on settlement would drop the
    // player back to a card showing an emoji for the next several seconds. The
    // dialog waits instead, and the player dismisses it.
    it('shows success and stays open once settled, so the pet can be seen', async () => {
        const onClose = renderModal();
        await userEvent.type(screen.getByPlaceholderText('Enter pet name...'), 'Sparky');

        act(() => {
            capturedOnSuccess?.();
        });

        expect(screen.getByText('Pet "Sparky" created successfully!')).toBeInTheDocument();
        expect(onClose).not.toHaveBeenCalled();
    });

    it('closes on Done once the pet has settled', async () => {
        const onClose = renderModal();
        await userEvent.type(screen.getByPlaceholderText('Enter pet name...'), 'Sparky');

        act(() => {
            capturedOnSuccess?.();
        });
        await userEvent.click(screen.getByRole('button', { name: 'Done' }));

        expect(createPet.reset).toHaveBeenCalled();
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('shows a placeholder until the pet exists, since its DNA is not fixed yet', () => {
        renderModal();
        expect(screen.getByText('?')).toBeInTheDocument();
    });

    // The in-progress guard exists to stop a mid-flight mint being discarded
    // with its fee spent. Once the pet has settled it protects nothing, and a
    // flag still set at that point trapped the dialog: neither Done nor the
    // close button did anything and the pet could not be dismissed.
    it('still closes after settling when an in-progress flag is stuck on', async () => {
        const onClose = renderModal();
        await userEvent.type(screen.getByPlaceholderText('Enter pet name...'), 'Sparky');

        asyncFlags.isSettling = true;
        act(() => {
            capturedOnSuccess?.();
        });

        await userEvent.click(screen.getByRole('button', { name: 'Done' }));
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('still refuses to close while a mint is genuinely in flight', async () => {
        // Set before render: the click handler closes over the flags as of the
        // last render, so flipping one afterwards changes nothing.
        asyncFlags.isAwaitingFulfillment = true;
        const onClose = renderModal();
        await userEvent.click(screen.getByRole('button', { name: 'Close modal' }));

        expect(onClose).not.toHaveBeenCalled();
    });

    it('closes and resets via the close button', async () => {
        const onClose = renderModal();
        await userEvent.click(screen.getByRole('button', { name: 'Close modal' }));

        expect(createPet.reset).toHaveBeenCalled();
        expect(onClose).toHaveBeenCalledOnce();
    });
});

/**
 * A Solana wallet can only hold one mint request at a time, so an unresolved one is the
 * reason Create Pet would fail. The dialog is where the player is standing when it does.
 */
describe('an unresolved Solana mint', () => {
    it('says nothing when there is no pending request', () => {
        renderModal();
        expect(screen.queryByText(/unresolved mint on Solana/)).not.toBeInTheDocument();
    });

    it('explains that a new attempt resumes it while the randomness is live', () => {
        pendingMint.isPending = true;
        renderModal();

        expect(screen.getByText(/resume it rather than start a new one/)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Clear stuck mint' })).not.toBeInTheDocument();
    });

    // The mint fee is spent either way; `cancel_mint` only returns the request's rent. A
    // player deciding whether to clear it should read that before clicking, not after.
    it('offers the clear once it has expired, and says the fee is gone', async () => {
        pendingMint.isPending = true;
        pendingMint.canCancel = true;
        renderModal();

        expect(screen.getByText(/the mint fee is not returned/)).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Clear stuck mint' }));
        expect(pendingMint.cancel.run).toHaveBeenCalledOnce();
    });

    it('stays out of the way on EVM, which has its own settle path', () => {
        capabilities.kind = 'evm';
        pendingMint.isPending = true;
        pendingMint.canCancel = true;
        renderModal();

        expect(screen.queryByText(/unresolved mint on Solana/)).not.toBeInTheDocument();
    });
});
