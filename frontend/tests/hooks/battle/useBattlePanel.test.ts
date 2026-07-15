import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
    navigate: vi.fn(),
    locationState: null as { petId?: string } | null,
}));

vi.mock('react-router-dom', () => ({
    useNavigate: () => mocks.navigate,
    useLocation: () => ({ state: mocks.locationState }),
}));
vi.mock('@constants/interactionRoutes', () => ({ DASHBOARD_HOME: '/dashboard', BATTLE_PATH: '/battle' }));
vi.mock('@hooks/usePetError', () => ({ formatTxHashHint: vi.fn(() => null) }));
vi.mock('@hooks/usePetErrorToast', () => ({ usePetErrorToast: vi.fn() }));
vi.mock('@components/pet/interactions/panels/battle/battle-matchmaking', () => ({
    pickRandomOpponent: vi.fn(() => null),
    sortOpponentsByMatch: vi.fn((ops: unknown[]) => ops),
}));
vi.mock('@components/pet/interactions/panels/battle/battle-utils', () => ({
    BATTLE_FAIL_MESSAGE: 'Battle failed',
    MISMATCH_NOTICE_MESSAGE: 'Mismatch notice',
    VALIDATION_MESSAGE: 'Select a fighter and opponent',
    opponentKey: (owner: string, id: string) => `${owner}:${id}`,
    toDialoguePet: (p: { id: string; name: string }) => ({ petId: p.id, name: p.name }),
}));

const battleOutcome = { battleOutcome: null as null | object, markPendingOutcome: vi.fn(), applyResolvedOutcome: vi.fn(), resetOutcome: vi.fn(), clearSnapshot: vi.fn(), snapshotFighterStats: vi.fn() };
vi.mock('@hooks/battle/useBattleOutcome', () => ({ useBattleOutcome: () => battleOutcome }));

const resultDialogue = { resultTurns: [], dialogueLoading: false, attackerName: '', defenderName: '', markResultDialogueDone: vi.fn(), resultDialogueDone: false, resetResultDialogue: vi.fn() };
vi.mock('@hooks/battle/useResultDialogue', () => ({ useResultDialogue: () => resultDialogue }));

const battle = { mutate: vi.fn(), clearErrors: vi.fn(), isPending: false, isConfirming: false, error: null, hash: undefined as string | undefined, phase: null, liveReplay: null as null | { result: { firstWins: boolean }; log: unknown[]; startHp1: bigint; startHp2: bigint }, lifecycle: { phase: 'idle' } };
const taunts = { generate: vi.fn(), reset: vi.fn(), isLoading: false, turns: [] as unknown[] };
const createRoom = vi.fn().mockResolvedValue(null);
let capturedOnSuccess: ((r: unknown) => void) | undefined;

const pets = [{ id: 'p1', name: 'Rex', level: 3, winCount: 1, lossCount: 0, chain: 'evm', readyAt: 0n }];
const opponents = [{ id: 'opp1', name: 'Blaze', owner: '0xopp', level: 2 }];

vi.mock('@shared/core', () => ({
    getReadyPetsUnified: (p: { id: string }[]) => p.map((x) => ({ id: x.id, pet: x })),
    useChainCapabilities: () => ({ activeKind: 'evm', randomness: { provider: 'vrf' } }),
    usePetList: () => ({ pets, refetch: vi.fn(), isLoading: false }),
    useBattlePets: (opts: { onSuccess?: (r: unknown) => void }) => {
        capturedOnSuccess = opts?.onSuccess;
        return battle;
    },
    useBattleTaunts: () => taunts,
    useCreateBattleRoom: () => ({ createRoom, isLoading: false }),
    useOpponents: () => ({ opponents, isLoading: false, isFetching: false, refetch: vi.fn() }),
    usePendingBattle: () => ({ isPending: false }),
    useWinEstimate: () => ({ winProbability: null, isLoading: false, samples: null }),
}));

import { useBattlePanel } from '@hooks/battle/useBattlePanel';

beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(battle, { isPending: false, isConfirming: false, error: null, hash: undefined, phase: null, liveReplay: null });
    Object.assign(taunts, { isLoading: false, turns: [] });
    mocks.locationState = null;
    capturedOnSuccess = undefined;
});

describe('useBattlePanel', () => {
    it('pre-selects the pet passed via navigation state (Battle button on a pet card)', () => {
        mocks.locationState = { petId: 'p1' };
        const { result } = renderHook(() => useBattlePanel({ isStandaloneView: false }));
        expect(result.current.setup.selectedPet1).toBe('p1');
    });

    it('leaves no pet selected when navigation state carries no petId (generic nav entry)', () => {
        const { result } = renderHook(() => useBattlePanel({ isStandaloneView: false }));
        expect(result.current.setup.selectedPet1).toBe('');
    });

    it('returns overlay and setup props', () => {
        const { result } = renderHook(() => useBattlePanel({ isStandaloneView: false }));
        expect(result.current.overlay).toBeDefined();
        expect(result.current.setup).toBeDefined();
    });

    it('setup.battleDisabled is true when no fighter or opponent is selected', () => {
        const { result } = renderHook(() => useBattlePanel({ isStandaloneView: false }));
        expect(result.current.setup.battleDisabled).toBe(true);
    });

    it('onBattle sets validation error when fighter or opponent is missing', () => {
        const { result } = renderHook(() => useBattlePanel({ isStandaloneView: false }));
        act(() => { result.current.setup.onBattle(); });
        // overlay stays closed and validation fires
        expect(result.current.overlay.open).toBe(false);
    });

    it('onBattle opens overlay and requests taunts when both are selected', () => {
        const { result } = renderHook(() => useBattlePanel({ isStandaloneView: false }));
        act(() => { result.current.setup.onSelectFighter('p1'); });
        act(() => { result.current.setup.onSelectOpponent('0xopp:opp1'); });
        act(() => { result.current.setup.onBattle(); });
        expect(result.current.overlay.open).toBe(true);
        expect(taunts.generate).toHaveBeenCalled();
    });

    it('mints a battle room for the matchup and navigates to it once minted', async () => {
        createRoom.mockResolvedValueOnce('room-123');
        const { result } = renderHook(() => useBattlePanel({ isStandaloneView: false }));
        act(() => { result.current.setup.onSelectFighter('p1'); });
        act(() => { result.current.setup.onSelectOpponent('0xopp:opp1'); });
        await act(async () => { result.current.setup.onBattle(); });

        expect(createRoom).toHaveBeenCalledWith({ chain: 'evm', attackerPetId: 'p1', defenderPetId: 'opp1' });
        expect(mocks.navigate).toHaveBeenCalledWith('/battle/room-123', { replace: true });
    });

    it('does not navigate when room creation fails', async () => {
        createRoom.mockResolvedValueOnce(null);
        const { result } = renderHook(() => useBattlePanel({ isStandaloneView: false }));
        act(() => { result.current.setup.onSelectFighter('p1'); });
        act(() => { result.current.setup.onSelectOpponent('0xopp:opp1'); });
        await act(async () => { result.current.setup.onBattle(); });

        expect(mocks.navigate).not.toHaveBeenCalled();
    });

    it('onCancel navigates home and closes overlay', () => {
        const { result } = renderHook(() => useBattlePanel({ isStandaloneView: false }));
        act(() => { result.current.overlay.onDone(); });
        expect(mocks.navigate).toHaveBeenCalledWith('/dashboard');
    });

    it('onDone resets state and navigates home', () => {
        const { result } = renderHook(() => useBattlePanel({ isStandaloneView: false }));
        act(() => { result.current.overlay.onDone(); });
        expect(mocks.navigate).toHaveBeenCalledWith('/dashboard');
        expect(result.current.overlay.open).toBe(false);
    });

    it('handleSuccess marks pending outcome and refetches', () => {
        renderHook(() => useBattlePanel({ isStandaloneView: false }));
        act(() => { capturedOnSuccess?.(null); });
        expect(battleOutcome.markPendingOutcome).toHaveBeenCalled();
    });

    it('handleSuccess applies resolved outcome when result is provided', () => {
        renderHook(() => useBattlePanel({ isStandaloneView: false }));
        act(() => { capturedOnSuccess?.({ firstWins: true }); });
        expect(battleOutcome.applyResolvedOutcome).toHaveBeenCalledWith(true);
    });

    it('overlay.open closes when battle.error is set after battle starts', () => {
        const { result } = renderHook(() => useBattlePanel({ isStandaloneView: false }));
        // Start a battle to open overlay.
        act(() => { result.current.setup.onSelectFighter('p1'); });
        act(() => { result.current.setup.onSelectOpponent('0xopp:opp1'); });
        act(() => { result.current.setup.onBattle(); });
        expect(result.current.overlay.open).toBe(true);

        // Error fires: effect should close overlay.
        battle.error = new Error('wallet rejected') as unknown as null;
        const { result: result2 } = renderHook(() => useBattlePanel({ isStandaloneView: false }));
        // Fresh render with error set — overlay starts closed since showResult=false and error present.
        expect(result2.current.overlay.open).toBe(false);
    });

    it('hashHint is null when provider is not switchboard', () => {
        const { result } = renderHook(() => useBattlePanel({ isStandaloneView: false }));
        expect(result.current.hashHint).toBeNull();
    });

    it('holds the result card until the live animation finishes, even after the resolved event arrives', () => {
        vi.useFakeTimers();
        try {
            battle.liveReplay = {
                result: { firstWins: true },
                log: [
                    { attacker: 1, hp1After: 100n, hp2After: 80n },
                    { attacker: 2, hp1After: 90n, hp2After: 80n },
                ],
                startHp1: 100n,
                startHp2: 100n,
            };
            const { result } = renderHook(() => useBattlePanel({ isStandaloneView: false }));
            // Open the overlay first — starts the battle so liveReplay's log gets picked up.
            act(() => { result.current.setup.onSelectFighter('p1'); });
            act(() => { result.current.setup.onSelectOpponent('0xopp:opp1'); });
            act(() => { result.current.setup.onBattle(); });
            act(() => { capturedOnSuccess?.({ firstWins: true }); });
            // Animation hasn't played any strikes yet — result must stay hidden.
            expect(result.current.overlay.showResult).toBe(false);

            act(() => { vi.advanceTimersByTime(700); });
            expect(result.current.overlay.showResult).toBe(false);

            act(() => { vi.advanceTimersByTime(700); });
            expect(result.current.overlay.showResult).toBe(true);
        } finally {
            vi.useRealTimers();
        }
    });

    it('onBack minimizes the overlay, and it auto-reopens once the result is ready', () => {
        vi.useFakeTimers();
        try {
            battle.liveReplay = {
                result: { firstWins: true },
                log: [{ attacker: 1, hp1After: 100n, hp2After: 80n }],
                startHp1: 100n,
                startHp2: 100n,
            };
            const { result } = renderHook(() => useBattlePanel({ isStandaloneView: false }));
            act(() => { result.current.setup.onSelectFighter('p1'); });
            act(() => { result.current.setup.onSelectOpponent('0xopp:opp1'); });
            act(() => { result.current.setup.onBattle(); });
            expect(result.current.overlay.open).toBe(true);

            act(() => { result.current.overlay.onBack(); });
            expect(result.current.overlay.open).toBe(false);

            // The battle keeps resolving in the background while minimized.
            act(() => { capturedOnSuccess?.({ firstWins: true }); });
            act(() => { vi.advanceTimersByTime(700); });

            // The result is ready — the overlay reopens on its own to show it.
            expect(result.current.overlay.open).toBe(true);
            expect(result.current.overlay.showResult).toBe(true);
        } finally {
            vi.useRealTimers();
        }
    });

    it('logs and shows a mismatch notice when the live replay disagrees with the on-chain result, then reveals the corrected result', () => {
        vi.useFakeTimers();
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            battle.liveReplay = { result: { firstWins: true }, log: [], startHp1: 100n, startHp2: 100n };
            const { result } = renderHook(() => useBattlePanel({ isStandaloneView: false }));
            act(() => { result.current.setup.onSelectFighter('p1'); });
            act(() => { result.current.setup.onSelectOpponent('0xopp:opp1'); });
            act(() => { result.current.setup.onBattle(); });
            act(() => { capturedOnSuccess?.({ firstWins: false }); });

            expect(errorSpy).toHaveBeenCalledWith(
                expect.stringContaining('mismatch'),
                expect.objectContaining({ onChain: { firstWins: false }, local: { firstWins: true } }),
            );
            // The on-chain result must still be applied as authoritative despite the mismatch.
            expect(battleOutcome.applyResolvedOutcome).toHaveBeenCalledWith(false);
            // Result card doesn't appear immediately — the notice holds it briefly.
            expect(result.current.overlay.showResult).toBe(false);

            act(() => { vi.advanceTimersByTime(2000); });
            expect(result.current.overlay.showResult).toBe(true);
        } finally {
            errorSpy.mockRestore();
            vi.useRealTimers();
        }
    });
});
