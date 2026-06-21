import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';

const notifyError = vi.fn();
vi.mock('@hooks/useNotifyError', () => ({ useNotifyError: () => notifyError }));

vi.mock('@components/pet/transfer/send-pet-modal', () => ({
    default: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div data-testid="send-modal" /> : null),
}));
vi.mock('@components/pet/creation/create-pet-modal', () => ({
    default: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div data-testid="create-modal" /> : null),
}));

// Per-pet readiness comes from usePetCooldowns; statusFor returns a cooldown VM.
const cooldownStatus = {
    onCooldown: false,
    battleReady: true,
    battleOnCooldown: false,
    battleLabel: '',
    breedOnCooldown: false,
    breedLabel: '',
    trainOnCooldown: false,
    trainLabel: '',
};
vi.mock('@hooks/usePetCooldowns', () => ({
    usePetCooldowns: () => ({ statusFor: () => cooldownStatus }),
}));

const petList = {
    pets: [] as Array<Record<string, unknown>>,
    isLoading: false,
    error: null as unknown,
    refetch: vi.fn(),
};
const capabilities = { isConnected: true };

vi.mock('@shared/core', () => ({
    getGeneration: () => 0,
    getLifePercent: () => 80,
    getXpNumbers: () => ({ xpCurrent: 10, xpMax: 100 }),
    getXpPercent: () => 10,
    getPetAvatar: () => 'avatar',
    getPetClass: () => 'Warrior',
    getPetProperties: () => ({ life: 5, attack: 6, defense: 7, intelligence: 8 }),
    getPetSkill: () => null,
    getRarityColor: () => 'rgb(1, 2, 3)',
    getRarityName: () => 'Rare',
    useChainCapabilities: () => capabilities,
    usePetList: () => petList,
}));

import PetGallery from '@components/pet/collection/pet-gallery';

const renderGallery = () =>
    render(
        <MemoryRouter>
            <PetGallery />
        </MemoryRouter>,
    );

const aPet = (over: Record<string, unknown> = {}) => ({
    id: '1',
    chain: 'evm',
    name: 'Sparky',
    level: 3,
    dna: 7,
    rarity: 2,
    winCount: 4,
    lossCount: 1,
    readyAt: '0',
    ...over,
});

beforeEach(() => {
    vi.clearAllMocks();
    capabilities.isConnected = true;
    Object.assign(petList, { pets: [], isLoading: false, error: null });
    Object.assign(cooldownStatus, {
        onCooldown: false,
        battleReady: true,
        battleOnCooldown: false,
        battleLabel: '',
    });
});

describe('PetGallery', () => {
    it('asks to connect when the wallet is disconnected', () => {
        capabilities.isConnected = false;
        const { container } = renderGallery();

        expect(screen.getByText('Connect your wallet to view your pets.')).toBeInTheDocument();
        expect(container.querySelector('.cp-idle--message')).not.toBeNull();
    });

    it('shows a loading state', () => {
        petList.isLoading = true;
        renderGallery();
        expect(screen.getByText('Loading your pets...')).toBeInTheDocument();
    });

    it('shows an error state and notifies', () => {
        petList.error = new Error('boom');
        renderGallery();

        expect(screen.getByText('Failed to load pet data. Please try again.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument();
        expect(notifyError).toHaveBeenCalledWith(
            'Failed to load pet data. Please try again.',
            expect.any(Error),
            'pet-list',
        );
    });

    it('shows the summon tile and opens the create modal', async () => {
        renderGallery();
        expect(screen.getByRole('button', { name: /Summon a Pet/ })).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: /Summon a Pet/ }));
        expect(screen.getByTestId('create-modal')).toBeInTheDocument();
    });

    it('renders a pet card and opens the send modal', async () => {
        petList.pets = [aPet()];
        renderGallery();

        expect(screen.getByText('Sparky')).toBeInTheDocument();
        expect(screen.getByText('Lv. 3')).toBeInTheDocument();
        expect(screen.getByText('Rare')).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: /Send Sparky/ }));
        expect(screen.getByTestId('send-modal')).toBeInTheDocument();
    });

    it('shows a cooldown status when the pet is not ready', () => {
        Object.assign(cooldownStatus, {
            onCooldown: true,
            battleReady: false,
            battleOnCooldown: true,
            battleLabel: '5m',
        });
        petList.pets = [aPet()];
        renderGallery();

        expect(screen.getByText(/ready in 5m/i)).toBeInTheDocument();
    });
});
