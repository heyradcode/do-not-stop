import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { fireEvent } from '@testing-library/dom';
import type { Pet } from '@shared/core';
import PetArt from '@components/pet/pet-art';

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

// petArtUrl reads the env var per call, so stubbing it needs no module reload:
// re-importing per test forced resetModules and a dynamic import, which under a
// full parallel run was slow enough to time out at random.
const loadPetArt = async () => PetArt;

beforeEach(() => {
    vi.stubEnv('VITE_IMAGE_SERVICE_URL', SERVICE);
});

afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
});

describe('PetArt', () => {
    it('requests the pet image from the configured service', async () => {
        const PetArt = await loadPetArt();
        render(<PetArt pet={pet()} />);

        expect(screen.getByRole('img')).toHaveAttribute('src', `${SERVICE}/image/evm/7.png`);
    });

    it('addresses a Solana pet by its Core asset pubkey, as the service expects', async () => {
        const PetArt = await loadPetArt();
        const asset = 'So11111111111111111111111111111111111111112';
        render(<PetArt pet={pet({ chain: 'solana', assetKey: asset })} />);

        expect(screen.getByRole('img')).toHaveAttribute('src', `${SERVICE}/image/solana/${asset}.png`);
    });

    // Progressive enhancement: nothing configured means nothing changes.
    it('shows the emoji when no service is configured', async () => {
        vi.stubEnv('VITE_IMAGE_SERVICE_URL', '');
        const PetArt = await loadPetArt();
        render(<PetArt pet={pet()} />);

        expect(screen.queryByRole('img')).toBeNull();
        expect(screen.getByText('🦉')).toBeInTheDocument(); // dna % 6 == 5
    });

    it('shows the emoji for a Solana pet with no asset key to look up', async () => {
        const PetArt = await loadPetArt();
        render(<PetArt pet={pet({ chain: 'solana', assetKey: undefined })} />);

        expect(screen.queryByRole('img')).toBeNull();
    });

    // Art is generated on demand, so the first request for a pet can take
    // seconds. The emoji covers that rather than leaving an empty frame.
    it('keeps showing the emoji until the image has loaded', async () => {
        const PetArt = await loadPetArt();
        render(<PetArt pet={pet()} />);

        expect(screen.getByText('🦉')).toBeInTheDocument();
        expect(screen.getByRole('img')).toHaveStyle({ opacity: '0' });

        fireEvent.load(screen.getByRole('img'));
        expect(screen.queryByText('🦉')).toBeNull();
        expect(screen.getByRole('img')).toHaveStyle({ opacity: '1' });
    });

    // loading="lazy" defers until the element nears the viewport, so the image
    // must keep a layout box while hidden. display:none would leave nothing to
    // intersect, and the image could never load at all.
    it('hides the loading image with opacity, never display:none', async () => {
        const PetArt = await loadPetArt();
        render(<PetArt pet={pet()} />);

        const image = screen.getByRole('img');
        expect(image).toHaveAttribute('loading', 'lazy');
        expect(image).not.toHaveStyle({ display: 'none' });
    });

    // The service answers 503 with Retry-After while a pet's art generates, but an
    // <img> only reports that it failed. Retrying once covers the first viewer of
    // a cold pet, who would otherwise see the emoji until they reloaded.
    it('retries once before giving up, matching the service Retry-After', async () => {
        vi.useFakeTimers();
        try {
            const PetArt = await loadPetArt();
            render(<PetArt pet={pet()} />);

            fireEvent.error(screen.getByRole('img'));
            // Still trying: the emoji shows, but the image has not been abandoned.
            expect(screen.getByRole('img')).toBeInTheDocument();

            act(() => { vi.advanceTimersByTime(30_000); });
            expect(screen.getByRole('img')).toBeInTheDocument();

            // Second failure is final; a broken image must not retry forever.
            fireEvent.error(screen.getByRole('img'));
            expect(screen.queryByRole('img')).toBeNull();
            expect(screen.getByText('🦉')).toBeInTheDocument();
        } finally {
            vi.useRealTimers();
        }
    });

    it('does not leave a timer behind when unmounted mid-retry', async () => {
        vi.useFakeTimers();
        try {
            const PetArt = await loadPetArt();
            const { unmount } = render(<PetArt pet={pet()} />);

            fireEvent.error(screen.getByRole('img'));
            unmount();

            // A gallery scrolling away must not fire state updates afterwards.
            expect(() => act(() => { vi.advanceTimersByTime(60_000); })).not.toThrow();
        } finally {
            vi.useRealTimers();
        }
    });

    it('tolerates a trailing slash on the configured URL', async () => {
        vi.stubEnv('VITE_IMAGE_SERVICE_URL', `${SERVICE}/`);
        const PetArt = await loadPetArt();
        render(<PetArt pet={pet()} />);

        expect(screen.getByRole('img')).toHaveAttribute('src', `${SERVICE}/image/evm/7.png`);
    });

    it('labels the image with the pet name, so the card is readable to a screen reader', async () => {
        const PetArt = await loadPetArt();
        render(<PetArt pet={pet({ name: 'Ada' })} />);

        expect(screen.getByRole('img')).toHaveAttribute('alt', 'Ada');
    });

    describe('fill', () => {
        it('sizes to 1em by default, inheriting the surrounding avatar font-size', async () => {
            const PetArt = await loadPetArt();
            render(<PetArt pet={pet()} />);

            expect(screen.getByRole('img')).toHaveStyle({ width: '1em', height: '1em' });
        });

        it('covers the positioned ancestor when filling', async () => {
            const PetArt = await loadPetArt();
            render(<PetArt pet={pet()} fill />);

            expect(screen.getByRole('img')).toHaveStyle({
                position: 'absolute',
                width: '100%',
                height: '100%',
                objectFit: 'cover',
            });
        });

        it('still falls back to the emoji when filling and the image fails', async () => {
            // Filling changes only the image. A pet whose art never loads must
            // still get its emoji, at the caller's font-size rather than
            // stretched across the frame the art would have covered.
            vi.useFakeTimers();
            try {
                const PetArt = await loadPetArt();
                render(<PetArt pet={pet()} fill />);

                fireEvent.error(screen.getByRole('img'));
                act(() => { vi.advanceTimersByTime(30_000); });
                fireEvent.error(screen.getByRole('img'));

                expect(screen.queryByRole('img')).toBeNull();
                expect(screen.getByText('🦉')).toBeInTheDocument();
            } finally {
                vi.useRealTimers();
            }
        });
    });
});
