import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DialogueTurn, OpponentPet } from '@shared/core';

vi.mock('@components/pet/interactions/panels/battle/battle-dialogue', () => ({
    default: ({ turns }: { turns: DialogueTurn[] }) => (
        <div data-testid="dialogue">{turns.length}</div>
    ),
}));

import BattleOverlay, {
    type BattleOverlayProps,
} from '@components/pet/interactions/panels/battle/parts/battle-overlay';

const opponent = { name: 'Rival', level: 5 } as unknown as OpponentPet;

const baseProps = (over: Partial<BattleOverlayProps> = {}): BattleOverlayProps => ({
    open: true,
    showResult: true,
    battleOutcome: { result: 'victory', leveledUp: false },
    opponent,
    resultTurns: [],
    dialogueLoading: false,
    resultAttackerName: 'Hero',
    resultDefenderName: 'Villain',
    onResultComplete: vi.fn(),
    resultDialogueDone: true,
    onRematch: vi.fn(),
    onDone: vi.fn(),
    rematchPending: false,
    battlePending: false,
    preResultTitle: 'Battle Starting',
    preResultStatus: null,
    tauntsLoading: false,
    tauntsTurns: [],
    onTauntsComplete: vi.fn(),
    fighterName: 'Hero',
    opponentName: 'Rival',
    ...over,
});

describe('BattleOverlay', () => {
    it('renders nothing when closed', () => {
        const { container } = render(<BattleOverlay {...baseProps({ open: false })} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('shows the pre-result phase with taunts and status', () => {
        render(
            <BattleOverlay
                {...baseProps({
                    showResult: false,
                    preResultStatus: 'Awaiting signature',
                    tauntsTurns: [{} as DialogueTurn],
                })}
            />,
        );

        expect(screen.getByText('Battle Starting')).toBeInTheDocument();
        expect(screen.getByText('Awaiting signature')).toBeInTheDocument();
        expect(screen.getByTestId('dialogue')).toHaveTextContent('1');
    });

    it('shows a pending resolving state with no actions', () => {
        render(<BattleOverlay {...baseProps({ battleOutcome: null })} />);

        expect(screen.getByText('Resolving…')).toBeInTheDocument();
        expect(screen.getByText('Checking battle outcome…')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Rematch' })).not.toBeInTheDocument();
    });

    it('renders a victory with the opponent line', () => {
        render(<BattleOverlay {...baseProps()} />);

        expect(screen.getByText('Victory!')).toBeInTheDocument();
        expect(screen.getByText('Your pet won the battle!')).toBeInTheDocument();
        expect(screen.getByText('vs Rival (Lv.5)')).toBeInTheDocument();
    });

    it('notes a level-up in the victory message', () => {
        render(<BattleOverlay {...baseProps({ battleOutcome: { result: 'victory', leveledUp: true } })} />);
        expect(screen.getByText('Your pet won and leveled up!')).toBeInTheDocument();
    });

    it('renders a defeat with a defeat-styled rematch button', () => {
        render(<BattleOverlay {...baseProps({ battleOutcome: { result: 'defeat', leveledUp: false } })} />);

        expect(screen.getByText('Defeated')).toBeInTheDocument();
        expect(screen.getByText('Lost to Rival (Lv.5)')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Rematch' })).toHaveClass('is-defeat');
    });

    it('gates the result actions until the dialogue is done', () => {
        render(<BattleOverlay {...baseProps({ resultDialogueDone: false })} />);

        expect(screen.getByRole('button', { name: 'Rematch' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Leave' })).toBeDisabled();
    });

    it('shows a preparing label and wires the action callbacks', async () => {
        const onRematch = vi.fn();
        const onDone = vi.fn();
        const { rerender } = render(<BattleOverlay {...baseProps({ onRematch, onDone })} />);

        await userEvent.click(screen.getByRole('button', { name: 'Rematch' }));
        await userEvent.click(screen.getByRole('button', { name: 'Leave' }));
        expect(onRematch).toHaveBeenCalledOnce();
        expect(onDone).toHaveBeenCalledOnce();

        rerender(<BattleOverlay {...baseProps({ rematchPending: true })} />);
        expect(screen.getByRole('button', { name: 'Preparing…' })).toBeInTheDocument();
    });

    it('renders the result dialogue while it is loading', () => {
        render(<BattleOverlay {...baseProps({ dialogueLoading: true })} />);
        expect(screen.getByTestId('dialogue')).toBeInTheDocument();
    });
});
