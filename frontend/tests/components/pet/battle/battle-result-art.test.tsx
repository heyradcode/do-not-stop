import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import BattleResultArt from '@components/pet/interactions/panels/battle/battle-result-art';

describe('BattleResultArt', () => {
    it('renders the pending art when there is no outcome', () => {
        const { container } = render(<BattleResultArt outcome={null} />);
        // Only the pending art uses <line> strokes.
        expect(container.querySelector('line')).not.toBeNull();
        expect(container.querySelector('path[stroke="#0fffae"]')).toBeNull();
    });

    it('renders the victory art on a win', () => {
        const { container } = render(
            <BattleResultArt outcome={{ result: 'victory', leveledUp: false }} />,
        );
        expect(container.querySelector('path[stroke="#0fffae"]')).not.toBeNull();
        expect(container.querySelector('line')).toBeNull();
    });

    it('renders the defeat art on a loss', () => {
        const { container } = render(
            <BattleResultArt outcome={{ result: 'defeat', leveledUp: false }} />,
        );
        expect(container.querySelector('path[stroke="#ff9ad6"]')).not.toBeNull();
        expect(container.querySelector('path[stroke="#0fffae"]')).toBeNull();
    });
});
