import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import MintedPetArt from '@components/pet/creation/create-pet-modal/parts/minted-pet-art';

const SERVICE = 'https://art.example.com';

beforeEach(() => {
    vi.stubEnv('VITE_IMAGE_SERVICE_URL', SERVICE);
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
});

describe('MintedPetArt', () => {
    it('shows the placeholder and requests nothing before the mint settles', () => {
        render(<MintedPetArt petId={null} chain="evm" />);

        expect(screen.getByText('?')).toBeInTheDocument();
        expect(screen.queryByRole('img')).toBeNull();
    });

    it('requests the new pet art once its id is known', () => {
        render(<MintedPetArt petId="42" chain="evm" />);

        expect(screen.getByRole('img')).toHaveAttribute('src', `${SERVICE}/image/evm/42.png`);
    });

    it('keeps the placeholder up while the art is still generating', () => {
        render(<MintedPetArt petId="42" chain="evm" />);

        expect(screen.getByText('?')).toBeInTheDocument();
        expect(screen.getByText(/Painting your pet/i)).toBeInTheDocument();

        fireEvent.load(screen.getByRole('img'));

        expect(screen.queryByText('?')).toBeNull();
        expect(screen.queryByText(/Painting your pet/i)).toBeNull();
    });

    // The whole point of this component over PetArt: art is generated on demand,
    // so the first request for a brand-new pet is a miss and answers 503 while
    // the service works. One retry is not enough to see it through.
    it('retries on a schedule rather than giving up after one attempt', () => {
        render(<MintedPetArt petId="42" chain="evm" />);

        for (const delay of [1_500, 3_000, 5_000]) {
            fireEvent.error(screen.getByRole('img'));
            act(() => { vi.advanceTimersByTime(delay); });
            expect(screen.getByRole('img')).toBeInTheDocument();
        }

        // Still trying, and still showing the player something.
        expect(screen.getByText('?')).toBeInTheDocument();
    });

    it('stops retrying eventually instead of looping on a broken service', () => {
        render(<MintedPetArt petId="42" chain="evm" />);

        for (let i = 0; i < 12; i++) {
            const img = screen.queryByRole('img');
            if (!img) break;
            fireEvent.error(img);
            act(() => { vi.advanceTimersByTime(30_000); });
        }

        expect(screen.queryByRole('img')).toBeNull();
        expect(screen.getByText(/still rendering/i)).toBeInTheDocument();
    });

    it('starts over for a second pet minted in the same session', () => {
        const { rerender } = render(<MintedPetArt petId="42" chain="evm" />);
        fireEvent.load(screen.getByRole('img'));
        expect(screen.queryByText('?')).toBeNull();

        rerender(<MintedPetArt petId="43" chain="evm" />);

        // Not still showing the previous pet while the new one generates.
        expect(screen.getByText('?')).toBeInTheDocument();
        expect(screen.getByRole('img')).toHaveAttribute('src', `${SERVICE}/image/evm/43.png`);
    });

    it('leaves no timer behind when the dialog closes mid-generation', () => {
        const { unmount } = render(<MintedPetArt petId="42" chain="evm" />);

        fireEvent.error(screen.getByRole('img'));
        unmount();

        expect(() => act(() => { vi.advanceTimersByTime(120_000); })).not.toThrow();
    });
});
