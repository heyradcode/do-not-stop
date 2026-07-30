import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { fireEvent } from '@testing-library/dom';
import type { Pet } from '@shared/core';

const SERVICE = 'https://art.example.com';

const pet = (overrides: Partial<Pet> = {}): Pet => ({
    id: '7',
    chain: 'evm',
    name: 'Sparky',
    dna: 79_34_05_61_88_13_42_07n,
    level: 1,
    rarity: 3,
    winCount: 0,
    lossCount: 0,
    readyAt: 0,
    ...overrides,
} as Pet);

/** The module reads the env var at import time, so each case needs a fresh
 *  import after stubbing. */
const loadPetArt = async () => {
    vi.resetModules();
    return (await import('@components/pet/pet-art')).default;
};

beforeEach(() => {
    vi.stubEnv('VITE_IMAGE_SERVICE_URL', SERVICE);
});

afterEach(() => {
    // Explicit, and before resetModules: each test re-imports the component to
    // pick up a fresh env stub, which yields a second React instance. The shared
    // cleanup in tests/setup.ts then cannot unmount the tree, and renders pile up
    // in one document until a query finds two images.
    cleanup();
    vi.unstubAllEnvs();
    vi.resetModules();
});

describe('PetArt', () => {
    it('requests the pet image from the configured service', async () => {
        const PetArt = await loadPetArt();
        render(<PetArt pet={pet()} />);

        expect(screen.getByRole('img', { hidden: true })).toHaveAttribute('src', `${SERVICE}/image/evm/7.png`);
    });

    it('addresses a Solana pet by its Core asset pubkey, as the service expects', async () => {
        const PetArt = await loadPetArt();
        const asset = 'So11111111111111111111111111111111111111112';
        render(<PetArt pet={pet({ chain: 'solana', assetKey: asset })} />);

        expect(screen.getByRole('img', { hidden: true })).toHaveAttribute('src', `${SERVICE}/image/solana/${asset}.png`);
    });

    // Progressive enhancement: nothing configured means nothing changes.
    it('shows the emoji when no service is configured', async () => {
        vi.stubEnv('VITE_IMAGE_SERVICE_URL', '');
        const PetArt = await loadPetArt();
        render(<PetArt pet={pet()} />);

        expect(screen.queryByRole('img', { hidden: true })).toBeNull();
        expect(screen.getByText('🦉')).toBeInTheDocument(); // dna % 6 == 5
    });

    it('shows the emoji for a Solana pet with no asset key to look up', async () => {
        const PetArt = await loadPetArt();
        render(<PetArt pet={pet({ chain: 'solana', assetKey: undefined })} />);

        expect(screen.queryByRole('img', { hidden: true })).toBeNull();
    });

    // Art is generated on demand, so the first request for a pet can take
    // seconds. The emoji covers that rather than leaving an empty frame.
    it('keeps showing the emoji until the image has loaded', async () => {
        const PetArt = await loadPetArt();
        render(<PetArt pet={pet()} />);

        expect(screen.getByText('🦉')).toBeInTheDocument();
        expect(screen.getByRole('img', { hidden: true })).toHaveStyle({ display: 'none' });

        fireEvent.load(screen.getByRole('img', { hidden: true }));
        expect(screen.queryByText('🦉')).toBeNull();
    });

    it('falls back to the emoji when the image fails, rather than showing a broken frame', async () => {
        const PetArt = await loadPetArt();
        render(<PetArt pet={pet()} />);

        fireEvent.error(screen.getByRole('img', { hidden: true }));

        expect(screen.queryByRole('img', { hidden: true })).toBeNull();
        expect(screen.getByText('🦉')).toBeInTheDocument();
    });

    it('tolerates a trailing slash on the configured URL', async () => {
        vi.stubEnv('VITE_IMAGE_SERVICE_URL', `${SERVICE}/`);
        const PetArt = await loadPetArt();
        render(<PetArt pet={pet()} />);

        expect(screen.getByRole('img', { hidden: true })).toHaveAttribute('src', `${SERVICE}/image/evm/7.png`);
    });

    it('labels the image with the pet name, so the card is readable to a screen reader', async () => {
        const PetArt = await loadPetArt();
        render(<PetArt pet={pet({ name: 'Ada' })} />);

        expect(screen.getByRole('img', { hidden: true })).toHaveAttribute('alt', 'Ada');
    });
});
