import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('@shared/core', () => ({
    itemArtUrl: (itemType: string, service: string | undefined) =>
        service ? `${service}/items/${itemType}.png` : null,
    itemFallbackArtUrl: (itemType: string, service: string | undefined) =>
        service ? `${service}/items/${itemType}.svg` : null,
}));

import ItemArt from '@components/item/item-art';

const ITEM = { itemType: '3', name: 'Sunder Maul' };

beforeEach(() => {
    vi.stubEnv('VITE_IMAGE_SERVICE_URL', 'https://art.example.com');
});

describe('ItemArt', () => {
    it('shows the painted art first', () => {
        render(<ItemArt item={ITEM} />);
        expect(screen.getByAltText('Sunder Maul')).toHaveAttribute('src', 'https://art.example.com/items/3.png');
    });

    /**
     * The reason this component exists rather than a bare <img>. An item nobody has warmed
     * yet, a generation that outran its deadline, and a deployment with no Cloudflare keys
     * all look identical to the browser: the image failed. The SVG is drawn from the catalog
     * alone and is always available, so a failure downgrades to plainer art rather than a
     * hole in the card.
     */
    it('falls back to the deterministic SVG when the painted art fails', () => {
        render(<ItemArt item={ITEM} />);
        fireEvent.error(screen.getByAltText('Sunder Maul'));
        expect(screen.getByAltText('Sunder Maul')).toHaveAttribute('src', 'https://art.example.com/items/3.svg');
    });

    /**
     * The tile stays even when both sources fail, showing its placeholder. Collapsing it
     * would leave a hole where a card expects a square — the bag lays its corner controls
     * over this frame, and a plain tinted square is a better outcome than a missing box.
     */
    it('drops the image but keeps the tile once even the fallback fails', () => {
        const { container } = render(<ItemArt item={ITEM} />);
        fireEvent.error(screen.getByAltText('Sunder Maul'));
        fireEvent.error(screen.getByAltText('Sunder Maul'));

        expect(screen.queryByAltText('Sunder Maul')).not.toBeInTheDocument();
        expect(container).not.toBeEmptyDOMElement();
    });

    // Art is optional by construction: the app works without an image service, minus pictures.
    it('renders nothing when no image service is configured', () => {
        vi.stubEnv('VITE_IMAGE_SERVICE_URL', '');
        const { container } = render(<ItemArt item={ITEM} />);
        expect(container).toBeEmptyDOMElement();
    });

    // A bag mounts every card at once and a cold item's first request triggers a generation,
    // so only items actually on screen should ask for art.
    it('loads lazily', () => {
        render(<ItemArt item={ITEM} />);
        expect(screen.getByAltText('Sunder Maul')).toHaveAttribute('loading', 'lazy');
    });

    it('hides the image until it has loaded, so the card does not flash', () => {
        render(<ItemArt item={ITEM} />);
        const img = screen.getByAltText('Sunder Maul');
        expect(img).toHaveStyle({ opacity: '0' });
        fireEvent.load(img);
        expect(img).toHaveStyle({ opacity: '1' });
    });
});
