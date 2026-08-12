import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const notifyError = vi.fn();
vi.mock('@hooks/useNotifyError', () => ({ useNotifyError: () => notifyError }));
vi.mock('@hooks/useTxErrorToast', () => ({ useTxErrorToast: vi.fn() }));

/** A real 40-hex address, so the case-folding the self-check relies on is exercised. */
const EVM_SELF = `0x${'ab'.repeat(20)}`;

const isValid = vi.fn();
const capabilities = {
    activeKind: 'evm',
    address: { placeholder: '0x… address', label: 'Recipient address', isValid: (a: string) => isValid(a) },
    chainLabel: 'Ethereum',
    walletAddress: EVM_SELF,
};
/** Defaults to "answered, no gear", which is the case every pre-existing test assumes. */
const petEquipment = { equipped: [] as { slot: number; item: unknown }[], isSuccess: true };
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
    // On-curve check, stubbed by shape: the fixtures below choose addresses whose curve
    // status is what the test is about, so a real ed25519 check is not needed here.
    isSolanaWalletAddress: (a: string) => !a.startsWith('PDA'),
    // Shape-based account equality, mirroring the protocol's normalizeAccount: EVM
    // addresses fold case, base58 Solana pubkeys do not.
    sameAccount: (a: string, b: string) =>
        Boolean(a) && Boolean(b) &&
        (/^0x[0-9a-fA-F]{40}$/.test(a) ? a.toLowerCase() : a) ===
            (/^0x[0-9a-fA-F]{40}$/.test(b) ? b.toLowerCase() : b),
    useChainCapabilities: () => capabilities,
    usePetList: () => petList,
    usePetEquipment: () => petEquipment,
    getRarityColor: () => '#7dd6ff',
    SLOT: { weapon: 0, armor: 1, trinket: 2 },
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
    capabilities.activeKind = 'evm';
    capabilities.chainLabel = 'Ethereum';
    capabilities.walletAddress = EVM_SELF;
    transferPet.isPending = false;
    petEquipment.equipped = [];
    petEquipment.isSuccess = true;
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

    // EVM addresses are case-insensitive, so a checksummed spelling of the sender's own
    // address is still the sender.
    it('rejects sending a pet to yourself, whatever the casing', async () => {
        renderModal();
        await userEvent.type(screen.getByRole('textbox'), EVM_SELF.toUpperCase().replace('0X', '0x'));
        await userEvent.click(screen.getByRole('button', { name: 'Send Pet' }));

        expect(notifyError).toHaveBeenCalledWith(
            'You cannot send a pet to yourself',
            undefined,
            'send-pet-validation',
        );
    });

    // Base58 pubkeys are case-*sensitive*: two distinct Solana wallets can differ only in
    // case. Folding both sides, as this used to, refused a legitimate recipient as the
    // sender with no way for the player to tell why.
    it('does not read a case-different Solana pubkey as the sender', async () => {
        capabilities.activeKind = 'solana';
        capabilities.chainLabel = 'Solana';
        capabilities.walletAddress = 'HN7cABqLq46Es1jh92dQQpjP4LxRo7vLYCsRoQ8HWzEA';
        renderModal();

        await userEvent.type(
            screen.getByRole('textbox'),
            'hn7cabqlq46es1jh92dqqpjp4lxro7vlycsroq8hwzea',
        );
        await userEvent.click(screen.getByRole('button', { name: 'Send Pet' }));

        expect(notifyError).not.toHaveBeenCalled();
        expect(transferPet.mutate).toHaveBeenCalled();
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

// PetCore refuses to move a pet with a filled slot ("Unequip items before transferring"),
// so these are not advice — they are the reason the send would fail, surfaced before the
// wallet opens instead of after a rejected transaction.
describe('SendPetModal equipment warning', () => {
    const blade = { itemType: '1', name: 'Iron Fang', rarity: 1 };
    const vest = { itemType: '10', name: 'Hide Vest', rarity: 3 };

    it('names every item standing in the way', () => {
        petEquipment.equipped = [
            { slot: 0, item: blade },
            { slot: 1, item: vest },
        ];
        renderModal();

        expect(screen.getByText('Unequip before sending')).toBeInTheDocument();
        expect(screen.getByText('Iron Fang')).toBeInTheDocument();
        expect(screen.getByText('Hide Vest')).toBeInTheDocument();
        expect(screen.getByText('Weapon')).toBeInTheDocument();
        expect(screen.getByText('Armor')).toBeInTheDocument();
    });

    // The chain rejects this send, so letting it through only spends gas to reach the same
    // answer with a worse message.
    it('disables the send while gear is on', async () => {
        petEquipment.equipped = [{ slot: 0, item: blade }];
        renderModal();

        await userEvent.type(screen.getByRole('textbox'), '0xrecipient');
        expect(screen.getByRole('button', { name: 'Send Pet' })).toBeDisabled();
        await userEvent.click(screen.getByRole('button', { name: 'Send Pet' }));
        expect(transferPet.mutate).not.toHaveBeenCalled();
    });

    it('stays quiet for a pet with nothing equipped', () => {
        renderModal();
        expect(screen.queryByText('Unequip before sending')).not.toBeInTheDocument();
        expect(screen.queryByText(/Could not check/)).not.toBeInTheDocument();
    });

    // An unanswered read returns an empty list exactly like a bare pet. It must warn, but it
    // must NOT disable: a backend outage would otherwise make every pet look untransferable,
    // and the chain is the thing that actually decides.
    it('warns but still allows the send when the equipment read has not answered', async () => {
        petEquipment.isSuccess = false;
        renderModal();

        expect(screen.getByText(/Could not check this pet’s equipment/)).toBeInTheDocument();
        expect(screen.queryByText('Unequip before sending')).not.toBeInTheDocument();

        await userEvent.type(screen.getByRole('textbox'), '0xrecipient');
        await userEvent.click(screen.getByRole('button', { name: 'Send Pet' }));
        expect(transferPet.mutate).toHaveBeenCalledWith({ to: '0xrecipient', petId: '7' });
    });
});

/**
 * Base58 carries no checksum, so a mistyped Solana address usually still parses as a pubkey
 * and clears the format check. Roughly half of all 32-byte values are off the ed25519 curve,
 * which makes the curve test the sharpest cheap check on a typo available.
 *
 * A caution rather than a block, and the tests pin that: off-curve means only a program can
 * move what is sent there, not that it is lost, and a treasury or multisig PDA is a
 * legitimate destination.
 */
describe('an off-curve recipient', () => {
    beforeEach(() => {
        capabilities.activeKind = 'solana';
        capabilities.chainLabel = 'Solana';
        capabilities.walletAddress = 'HN7cABqLq46Es1jh92dQQpjP4LxRo7vLYCsRoQ8HWzEA';
    });

    it('says nothing for an ordinary wallet address', async () => {
        renderModal();
        await userEvent.type(screen.getByRole('textbox'), '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM');

        expect(screen.queryByText(/off the ed25519 curve/)).not.toBeInTheDocument();
    });

    it('warns when no wallet holds the key', async () => {
        renderModal();
        await userEvent.type(screen.getByRole('textbox'), 'PDAsomethingProgramDerived');

        expect(screen.getByText(/off the ed25519 curve/)).toBeInTheDocument();
    });

    it('still lets the send through, since a program can own a pet', async () => {
        renderModal();
        await userEvent.type(screen.getByRole('textbox'), 'PDAsomethingProgramDerived');
        await userEvent.click(screen.getByRole('button', { name: 'Send Pet' }));

        expect(notifyError).not.toHaveBeenCalled();
        expect(transferPet.mutate).toHaveBeenCalled();
    });

    // EVM has no curve concept, and blocking there would be nonsense.
    it('says nothing on EVM', async () => {
        capabilities.activeKind = 'evm';
        capabilities.chainLabel = 'Ethereum';
        capabilities.walletAddress = EVM_SELF;
        renderModal();
        await userEvent.type(screen.getByRole('textbox'), 'PDAlookalike');

        expect(screen.queryByText(/off the ed25519 curve/)).not.toBeInTheDocument();
    });
});
