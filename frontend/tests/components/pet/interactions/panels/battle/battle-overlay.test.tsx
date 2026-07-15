import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { extract, type DialogueTurn, type OpponentPet, type Pet } from '@shared/core';

vi.mock('@components/pet/interactions/panels/battle/battle-dialogue', () => ({
    default: ({ turns }: { turns: DialogueTurn[] }) => (
        <div data-testid="dialogue">{turns.length}</div>
    ),
}));

import BattleOverlay, {
    type BattleOverlayProps,
} from '@components/pet/interactions/panels/battle/parts/battle-overlay';

const opponent = {
    name: 'Rival', level: 5, rarity: 2, dna: 1n, winCount: 3, lossCount: 2, speciesId: 4,
} as unknown as OpponentPet;
const fighter = {
    id: '1', chain: 'evm', name: 'Hero', dna: 12345n, level: 8, rarity: 3,
    winCount: 4, lossCount: 1, readyAt: 0, speciesId: 2,
} as Pet;

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
    onDone: vi.fn(),
    onBack: vi.fn(),
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

        expect(screen.getByText(/Battle Starting/)).toBeInTheDocument();
        expect(screen.getByText('Awaiting signature')).toBeInTheDocument();
        expect(screen.getByTestId('dialogue')).toHaveTextContent('1');
    });

    it('shows a pending resolving state with no actions', () => {
        render(<BattleOverlay {...baseProps({ battleOutcome: null })} />);

        expect(screen.getByText('Resolving…')).toBeInTheDocument();
        expect(screen.getByText('Checking battle outcome…')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Leave/ })).not.toBeInTheDocument();
    });

    it('renders a victory with the opponent line', () => {
        render(<BattleOverlay {...baseProps()} />);

        expect(screen.getByText('VICTORY!')).toBeInTheDocument();
        expect(screen.getByText('Your pet won the battle!')).toBeInTheDocument();
        expect(screen.getByText('vs Rival (Lv.5)')).toBeInTheDocument();
    });

    it('notes a level-up in the victory message', () => {
        render(<BattleOverlay {...baseProps({ battleOutcome: { result: 'victory', leveledUp: true } })} />);
        expect(screen.getByText('Your pet won and leveled up!')).toBeInTheDocument();
    });

    it('renders a defeat result', () => {
        render(<BattleOverlay {...baseProps({ battleOutcome: { result: 'defeat', leveledUp: false } })} />);

        expect(screen.getByText('DEFEATED')).toBeInTheDocument();
        expect(screen.getByText('Lost to Rival (Lv.5)')).toBeInTheDocument();
    });

    it('gates the result actions until the dialogue is done', () => {
        render(<BattleOverlay {...baseProps({ resultDialogueDone: false })} />);

        expect(screen.getByRole('button', { name: /Leave/ })).toBeDisabled();
    });

    it('wires the done action callback', async () => {
        const onDone = vi.fn();
        render(<BattleOverlay {...baseProps({ onDone })} />);

        await userEvent.click(screen.getByRole('button', { name: /Leave/ }));
        expect(onDone).toHaveBeenCalledOnce();
    });

    it('shows a back button in the fighting scene and wires it, but not in the result scene', async () => {
        const onBack = vi.fn();
        const { rerender } = render(<BattleOverlay {...baseProps({ showResult: false, onBack })} />);

        await userEvent.click(screen.getByRole('button', { name: /Back/ }));
        expect(onBack).toHaveBeenCalledOnce();

        rerender(<BattleOverlay {...baseProps({ showResult: true, onBack })} />);
        expect(screen.queryByRole('button', { name: /Back/ })).not.toBeInTheDocument();
    });

    it('renders the result dialogue while it is loading', () => {
        render(<BattleOverlay {...baseProps({ dialogueLoading: true })} />);
        expect(screen.getByTestId('dialogue')).toBeInTheDocument();
    });

    it('puts the banter panel in a labeled rail, separate from the mechanical log', () => {
        render(<BattleOverlay {...baseProps({ liveLog: [{ text: 'Round 1 — Hero strikes Villain for 10 dmg', isFighter: true }] })} />);

        expect(screen.getByLabelText('Pet banter')).toBeInTheDocument();
        expect(screen.getByText('Round 1 — Hero strikes Villain for 10 dmg')).toBeInTheDocument();
    });

    it('shows the mechanical log by default with a waiting placeholder when liveLog is null (no live-replay feature)', () => {
        render(<BattleOverlay {...baseProps({ liveLog: null })} />);
        expect(screen.getByText('⚔ Battle Log')).toBeInTheDocument();
        expect(screen.getByText(/first blow hasn.t landed yet/)).toBeInTheDocument();
    });

    it('shows a waiting placeholder when liveLog is an empty array', () => {
        render(<BattleOverlay {...baseProps({ liveLog: [] })} />);
        expect(screen.getByText('⚔ Battle Log')).toBeInTheDocument();
        expect(screen.getByText(/first blow hasn.t landed yet/)).toBeInTheDocument();
    });

    it('keeps the decorative attack flashes off until the battle log has a strike', () => {
        const { container, rerender } = render(
            <BattleOverlay {...baseProps({ showResult: false, liveLog: [] })} />,
        );
        expect(container.querySelector('.sceneHitIn')).not.toHaveClass('isActive');
        expect(container.querySelector('.sceneHitOut')).not.toHaveClass('isActive');

        rerender(
            <BattleOverlay
                {...baseProps({
                    showResult: false,
                    liveLog: [{ text: 'Round 1 — Hero strikes Villain for 10 dmg', isFighter: true }],
                })}
            />,
        );
        expect(container.querySelector('.sceneHitIn')).toHaveClass('isActive');
        expect(container.querySelector('.sceneHitOut')).toHaveClass('isActive');
    });

    it('shows each fighter\'s DNA-derived combat stats in the top HP bar', () => {
        render(<BattleOverlay {...baseProps({ showResult: false, fighter })} />);

        const fighterAttrs = extract(fighter.dna, fighter.rarity, fighter.level);
        const opponentAttrs = extract(opponent.dna, opponent.rarity, opponent.level);
        expect(screen.getByText(`⚔️ ${fighterAttrs.atk}`)).toBeInTheDocument();
        expect(screen.getByText(`🧠 ${fighterAttrs.int}`)).toBeInTheDocument();
        expect(screen.getByText(`⚔️ ${opponentAttrs.atk}`)).toBeInTheDocument();
        expect(screen.getByText(`🧠 ${opponentAttrs.int}`)).toBeInTheDocument();
    });

    it('shows each fighter\'s rarity, level, skill archetype, and record', () => {
        render(<BattleOverlay {...baseProps({ showResult: false, fighter })} />);

        expect(screen.getByText('Rare')).toBeInTheDocument();
        expect(screen.getByText(/Lv\.8/)).toBeInTheDocument();
        expect(screen.getByText(/Swift/)).toBeInTheDocument();
        expect(screen.getByText(/4W-1L/)).toBeInTheDocument();

        expect(screen.getByText('Uncommon')).toBeInTheDocument();
        expect(screen.getByText(/Lv\.5/)).toBeInTheDocument();
        expect(screen.getByText(/Fury/)).toBeInTheDocument();
        expect(screen.getByText(/3W-2L/)).toBeInTheDocument();
    });

    it('shows the mechanical log during the fighting phase too', () => {
        render(
            <BattleOverlay
                {...baseProps({
                    showResult: false,
                    liveLog: [{ text: 'Round 1 — Villain strikes Hero for 8 dmg', isFighter: false }],
                })}
            />,
        );
        expect(screen.getByText('Round 1 — Villain strikes Hero for 8 dmg')).toBeInTheDocument();
    });
});
