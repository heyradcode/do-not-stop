import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { OpponentPet, Pet, ReadyPet } from '@shared/core';

vi.mock('@components/pet/interactions/panels/battle/parts/arena-slot', () => ({
    default: ({ side, pet }: { side: string; pet?: { name?: string } | null }) => (
        <div data-testid={`arena-${side}`}>{pet?.name ?? 'empty'}</div>
    ),
}));
vi.mock('@components/pet/interactions/panels/battle/parts/fighter-picker-card', () => ({
    default: ({ petId, onSelect }: { petId: string; onSelect: (id: string) => void }) => (
        <button onClick={() => onSelect(petId)}>fighter-{petId}</button>
    ),
}));
vi.mock('@components/pet/interactions/panels/battle/parts/opponent-picker-card', () => ({
    default: ({ opponent, onSelect }: { opponent: { id: string }; onSelect: (k: string) => void }) => (
        <button onClick={() => onSelect(opponent.id)}>opp-{opponent.id}</button>
    ),
}));
vi.mock('@components/common', () => ({
    AuthActionButton: ({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) => (
        <button onClick={onClick} disabled={disabled}>
            {children}
        </button>
    ),
}));
// New sibling that reaches into PetsConfig/wagmi — stub it out.
vi.mock('@components/pet/interactions/panels/battle/parts/pending-battle-notice', () => ({
    default: () => null,
}));

import BattleSetup, {
    type BattleSetupProps,
} from '@components/pet/interactions/panels/battle/parts/battle-setup';

const readyPet = (id: string, name: string): ReadyPet =>
    ({ id, pet: { id, name, level: 3 } as Pet }) as ReadyPet;
const opp = (id: string): OpponentPet =>
    ({ id, owner: '0xowner', name: `Foe ${id}`, level: 5 }) as unknown as OpponentPet;

const baseProps = (over: Partial<BattleSetupProps> = {}): BattleSetupProps => ({
    isStandaloneView: true,
    subtitle: 'Pick a fight',
    arenaClassName: 'arena',
    isArenaFighting: false,
    isArenaReady: false,
    showResult: false,
    selectedFighter: null,
    opponent: undefined,
    opponentSlotFlash: false,
    randomMatchDisabled: false,
    onRandomMatch: vi.fn(),
    readyPets: [readyPet('1', 'Alpha')],
    selectedPet1: '',
    onSelectFighter: vi.fn(),
    sortedOpponents: [opp('o1')],
    fighterLevel: null,
    selectedOpponentKey: '',
    onSelectOpponent: vi.fn(),
    selectedOpponentCardRef: null,
    opponentsLoading: false,
    onRefreshOpponents: vi.fn(),
    onBattle: vi.fn(),
    battleDisabled: false,
    battleButtonLabel: 'Battle!',
    onCancel: vi.fn(),
    ...over,
});

describe('BattleSetup', () => {
    it('shows the subtitle only in the embedded (non-standalone) view', () => {
        const { rerender } = render(<BattleSetup {...baseProps()} />);
        expect(screen.queryByText('Pick a fight')).not.toBeInTheDocument();

        rerender(<BattleSetup {...baseProps({ isStandaloneView: false })} />);
        expect(screen.getByText('Pick a fight')).toBeInTheDocument();
    });

    it.each([
        [{ isArenaFighting: true }, 'Fighting'],
        [{ showResult: true }, 'Complete'],
        [{ isArenaReady: true }, 'Ready'],
        [{}, 'Setup'],
    ] as const)('shows the arena badge %o as %s', (over, badge) => {
        render(<BattleSetup {...baseProps(over)} />);
        expect(screen.getByText(badge)).toBeInTheDocument();
    });

    it('renders the selected fighter and opponent in the arena slots', () => {
        render(
            <BattleSetup
                {...baseProps({
                    selectedFighter: { name: 'Alpha' } as Pet,
                    opponent: opp('o1'),
                })}
            />,
        );
        expect(screen.getByTestId('arena-fighter')).toHaveTextContent('Alpha');
        expect(screen.getByTestId('arena-opponent')).toHaveTextContent('Foe o1');
    });

    it('shows an empty message when there are no ready fighters', () => {
        render(<BattleSetup {...baseProps({ readyPets: [] })} />);
        expect(
            screen.getByText('No ready pets. Wait for cooldowns to finish before battling.'),
        ).toBeInTheDocument();
    });

    it('selects a fighter from the strip', async () => {
        const onSelectFighter = vi.fn();
        render(<BattleSetup {...baseProps({ onSelectFighter })} />);

        await userEvent.click(screen.getByRole('button', { name: 'fighter-1' }));
        expect(onSelectFighter).toHaveBeenCalledWith('1');
    });

    it('shows the level-match hint when a fighter level is known', () => {
        const { rerender } = render(<BattleSetup {...baseProps()} />);
        expect(screen.queryByText(/sorted by level match/)).not.toBeInTheDocument();

        rerender(<BattleSetup {...baseProps({ fighterLevel: 4 })} />);
        expect(screen.getByText(/sorted by level match/)).toBeInTheDocument();
    });

    it('shows a finding state while opponents load with none yet', () => {
        render(<BattleSetup {...baseProps({ opponentsLoading: true, sortedOpponents: [] })} />);
        expect(screen.getByText('Finding challengers in the arena…')).toBeInTheDocument();
    });

    it('shows a no-opponents message when the roster is empty', () => {
        render(<BattleSetup {...baseProps({ sortedOpponents: [] })} />);
        expect(screen.getByText(/No opponents available right now/)).toBeInTheDocument();
    });

    it('refreshes opponents, with a loading label while pending', async () => {
        const onRefreshOpponents = vi.fn();
        const { rerender } = render(<BattleSetup {...baseProps({ onRefreshOpponents })} />);

        await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
        expect(onRefreshOpponents).toHaveBeenCalledOnce();

        rerender(<BattleSetup {...baseProps({ opponentsLoading: true })} />);
        expect(screen.getByRole('button', { name: 'Loading…' })).toBeDisabled();
    });

    it('wires the battle and cancel controls', async () => {
        const onBattle = vi.fn();
        const onCancel = vi.fn();
        render(<BattleSetup {...baseProps({ onBattle, onCancel })} />);

        await userEvent.click(screen.getByRole('button', { name: 'Battle!' }));
        await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(onBattle).toHaveBeenCalledOnce();
        expect(onCancel).toHaveBeenCalledOnce();
    });
});
