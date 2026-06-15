import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const notifyError = vi.fn();
vi.mock('@hooks/useNotifyError', () => ({ useNotifyError: () => notifyError }));

vi.mock('@components/pet/transfer/send-pet-modal', () => ({
    default: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div data-testid="send-modal" /> : null),
}));
vi.mock('@components/pet/creation/create-pet-modal', () => ({
    default: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div data-testid="create-modal" /> : null),
}));

const isPetReady = vi.fn(() => true);
const petList = {
    pets: [] as Array<Record<string, unknown>>,
    isLoading: false,
    error: null as unknown,
    refetch: vi.fn(),
};
const capabilities = { isConnected: true };

vi.mock('@shared/core', () => ({
    getGeneration: () => 0,
    getPropertyEmoji: () => '🔥',
    getXpNumbers: () => ({ xpCurrent: 10, xpMax: 100 }),
    getXpPercent: () => 10,
    getPetAvatar: () => 'avatar',
    getPetClass: () => 'Warrior',
    getPetElement: () => 'Fire',
    getPetProperties: () => ({ strength: 5 }),
    getRarityColor: () => 'rgb(1, 2, 3)',
    getRarityName: () => 'Rare',
    getTimeUntilReady: () => '5m',
    getPetSkill: () => null,
    isPetReady: (...a: unknown[]) => isPetReady(...a),
    useChainCapabilities: () => capabilities,
    usePetList: () => petList,
}));

import PetGallery from '@components/pet/collection/pet-gallery';

const aPet = (over: Record<string, unknown> = {}) => ({
    id: '1',
    chain: 'evm',
    name: 'Sparky',
    level: 3,
    dna: 7,
    rarity: 2,
    readyAt: '0',
    ...over,
});

beforeEach(() => {
    vi.clearAllMocks();
    capabilities.isConnected = true;
    Object.assign(petList, { pets: [], isLoading: false, error: null });
    isPetReady.mockReturnValue(true);
});

describe('PetGallery', () => {
    it('asks to connect when the wallet is disconnected', () => {
        capabilities.isConnected = false;
        const { container } = render(<PetGallery />);

        expect(screen.getByText('Connect your wallet to view your pets')).toBeInTheDocument();
        expect(container.querySelector('.wallet-disconnected')).not.toBeNull();
    });

    it('shows a loading state', () => {
        petList.isLoading = true;
        render(<PetGallery />);
        expect(screen.getByText('Loading your pets...')).toBeInTheDocument();
    });

    it('shows an error state and notifies', () => {
        petList.error = new Error('boom');
        render(<PetGallery />);

        expect(screen.getByText('Failed to load pet data. Please try again.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument();
        expect(notifyError).toHaveBeenCalledWith(
            'Failed to load pet data. Please try again.',
            expect.any(Error),
            'pet-list',
        );
    });

    it('shows the empty altar and opens the create modal', async () => {
        render(<PetGallery />);
        expect(screen.getByText('Awaken your first companion')).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: /Create your first pet/ }));
        expect(screen.getByTestId('create-modal')).toBeInTheDocument();
    });

    it('renders a pet card and opens the send modal', async () => {
        petList.pets = [aPet()];
        render(<PetGallery />);

        expect(screen.getByRole('heading', { name: 'Sparky' })).toBeInTheDocument();
        expect(screen.getByText('Lv. 3')).toBeInTheDocument();
        expect(screen.getByText('Rare')).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: /Send/ }));
        expect(screen.getByTestId('send-modal')).toBeInTheDocument();
    });

    it('shows a cooldown status when the pet is not ready', () => {
        isPetReady.mockReturnValue(false);
        petList.pets = [aPet()];
        render(<PetGallery />);

        expect(screen.getByText(/Ready in 5m/)).toBeInTheDocument();
    });

    it('refetches when the refresh button is clicked', async () => {
        petList.pets = [aPet()];
        render(<PetGallery />);

        await userEvent.click(screen.getByTitle('Refresh'));
        expect(petList.refetch).toHaveBeenCalled();
    });
});
