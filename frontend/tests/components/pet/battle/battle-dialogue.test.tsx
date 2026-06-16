import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { DialogueTurn } from '@shared/core';

import BattleDialogue from '@components/pet/interactions/panels/battle/battle-dialogue';

const turn = (speaker: 'attacker' | 'defender', text: string): DialogueTurn =>
    ({ speaker, phase: 'taunt', text }) as unknown as DialogueTurn;

// Real timers: the typewriter runs at ~18ms/char + 450ms/turn, so a couple of
// short turns settle well within waitFor's window.

describe('BattleDialogue', () => {
    it('shows a thinking state while loading with no turns', () => {
        render(<BattleDialogue turns={[]} isLoading attackerName="Hero" defenderName="Villain" />);
        expect(screen.getByText('The fighters are talking…')).toBeInTheDocument();
    });

    it('renders nothing when there are no turns and not loading', () => {
        const { container } = render(
            <BattleDialogue turns={[]} isLoading={false} attackerName="Hero" defenderName="Villain" />,
        );
        expect(container).toBeEmptyDOMElement();
    });

    it('types out a single turn and fires onComplete once', async () => {
        const onComplete = vi.fn();
        render(
            <BattleDialogue
                turns={[turn('attacker', 'Hi')]}
                isLoading={false}
                attackerName="Hero"
                defenderName="Villain"
                onComplete={onComplete}
            />,
        );

        await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1), { timeout: 3000 });
        expect(screen.getByText('Hi')).toBeInTheDocument();
        expect(screen.getByText('Hero')).toBeInTheDocument();
    });

    it('plays multiple turns and maps speaker names', async () => {
        render(
            <BattleDialogue
                turns={[turn('attacker', 'Hi'), turn('defender', 'Yo')]}
                isLoading={false}
                attackerName="Hero"
                defenderName="Villain"
            />,
        );

        await waitFor(() => expect(screen.getByText('Yo')).toBeInTheDocument(), { timeout: 3000 });
        expect(screen.getByText('Hi')).toBeInTheDocument();
        expect(screen.getByText('Hero')).toBeInTheDocument();
        expect(screen.getByText('Villain')).toBeInTheDocument();
    });

    it('does not fire onComplete while the stream is still loading', async () => {
        const onComplete = vi.fn();
        render(
            <BattleDialogue
                turns={[turn('attacker', 'Hi')]}
                isLoading
                attackerName="Hero"
                defenderName="Villain"
                onComplete={onComplete}
            />,
        );

        // Wait for the line to finish typing, then assert onComplete stayed silent.
        await waitFor(() => expect(screen.getByText('Hi')).toBeInTheDocument(), { timeout: 3000 });
        expect(onComplete).not.toHaveBeenCalled();
    });
});
