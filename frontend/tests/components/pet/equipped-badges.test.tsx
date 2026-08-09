import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@shared/core', () => ({
    getRarityColor: (r: number) => ['#8B4513', '#C0C0C0', '#FFD700', '#FF69B4', '#8A2BE2'][r - 1] ?? '#8B4513',
    itemArtUrl: (itemType: string, service: string | undefined) =>
        service ? `${service}/items/${itemType}.png` : null,
}));

import EquippedBadges from '@components/pet/equipped-badges';

const gear = (slot: number, itemType: string, name: string) => ({
    slot,
    item: { itemType, key: name.toLowerCase(), category: 'equipment', slot, rarity: 3, effect: null, name, description: '' },
});

const BLADE = gear(0, '1', 'Iron Fang');
const VEST = gear(1, '10', 'Hide Vest');
const CHARM = gear(2, '20', 'River Charm');

beforeEach(() => {
    vi.stubEnv('VITE_IMAGE_SERVICE_URL', 'https://art.example.com');
});

describe('EquippedBadges', () => {
    it('shows one icon per equipped item', () => {
        render(<EquippedBadges equipped={[BLADE, VEST]} />);
        const imgs = screen.getByRole('img', { name: /^Wearing/ }).querySelectorAll('img');
        expect(imgs).toHaveLength(2);
        expect(imgs[0]).toHaveAttribute('src', 'https://art.example.com/items/1.png');
    });

    // Most pets wear nothing, and a placeholder on every card would cost more attention than
    // the feature is worth.
    it('renders nothing for a bare pet', () => {
        const { container } = render(<EquippedBadges equipped={[]} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('renders nothing before the batched read has answered', () => {
        const { container } = render(<EquippedBadges equipped={undefined} />);
        expect(container).toBeEmptyDOMElement();
    });

    // Slot order, not arrival order: the icons must not reshuffle between cards or renders.
    it('orders icons by slot regardless of the order given', () => {
        render(<EquippedBadges equipped={[CHARM, BLADE, VEST]} />);
        expect(screen.getByRole('img', { name: 'Wearing Iron Fang, Hide Vest, River Charm' }))
            .toBeInTheDocument();
    });

    // One label for the strip, not one per icon: a screen reader should hear what the pet is
    // wearing, not three images interrupting the card.
    it('announces the whole strip once', () => {
        render(<EquippedBadges equipped={[BLADE, VEST]} />);
        expect(screen.getByRole('img', { name: 'Wearing Iron Fang, Hide Vest' })).toBeInTheDocument();
        expect(screen.queryAllByRole('img', { name: 'Iron Fang' })).toHaveLength(0);
    });

    it('names each item for a mouse user, since the icons are tiny', () => {
        render(<EquippedBadges equipped={[BLADE]} />);
        expect(screen.getByTitle('Iron Fang')).toBeInTheDocument();
    });

    // With no image service the rarity-tinted square still says the slot is filled.
    it('still marks the slots when there is no art service', () => {
        vi.stubEnv('VITE_IMAGE_SERVICE_URL', '');
        render(<EquippedBadges equipped={[BLADE, VEST]} />);

        const strip = screen.getByRole('img', { name: /^Wearing/ });
        expect(strip.querySelectorAll('img')).toHaveLength(0);
        expect(strip.children).toHaveLength(2);
    });
});
