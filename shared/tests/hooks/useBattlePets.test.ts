// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const submit = vi.hoisted(() => vi.fn());
const submitState = vi.hoisted(() => ({ isPending: false, error: null as Error | null }));
const backendBattle = vi.hoisted(() => ({
    current: { data: undefined as unknown, isSettled: false, error: null as Error | null },
}));
const verified = vi.hoisted(() => ({
    current: { data: undefined as unknown, error: null as Error | null },
}));

vi.mock('../../src/hooks/useSubmitBattleIntent', () => ({
    useSubmitBattleIntent: () => ({ submit, isPending: submitState.isPending, error: submitState.error }),
}));
vi.mock('../../src/hooks/useBackendBattle', () => ({
    useBackendBattle: () => backendBattle.current,
}));
vi.mock('../../src/hooks/useVerifiedBattleReceipt', () => ({
    useVerifiedBattleReceipt: () => verified.current,
}));

import { useBattlePets } from '../../src/hooks/useBattlePets';

const ACCEPTED = { battleId: 'btl_0001' };

/** A receipt shaped as the protocol types it, with the attacker winning by default. */
function receipt(attackerWon = true) {
    return {
        seed: `0x${'0'.repeat(63)}5`,
        result: { attackerWon, rounds: 7, winnerHpRemaining: 42 },
        snapshot: { attacker: { petId: 1n }, defender: { petId: 2n } },
        progression: {
            attacker: { xpAwarded: attackerWon ? 100 : 25 },
            defender: { xpAwarded: attackerWon ? 25 : 100 },
        },
    };
}

function settledWith(state: string) {
    return { data: { state }, isSettled: true, error: null };
}

beforeEach(() => {
    vi.clearAllMocks();
    submitState.isPending = false;
    submitState.error = null;
    backendBattle.current = { data: undefined, isSettled: false, error: null };
    verified.current = { data: undefined, error: null };
    submit.mockResolvedValue(ACCEPTED);
});

describe('starting a battle', () => {
    it('submits a signed intent rather than sending a transaction', async () => {
        const { result } = renderHook(() => useBattlePets());

        await act(async () => {
            await result.current.mutate({ petId1: '1', petId2: '2', defenderOwner: '0xdef' });
        });

        expect(submit).toHaveBeenCalledWith({
            attackerPetId: '1',
            defenderPetId: '2',
            defenderOwner: '0xdef',
        });
    });

    it('passes the room through so spectators follow along', async () => {
        const { result } = renderHook(() => useBattlePets({ roomId: 'room_1' }));

        await act(async () => {
            await result.current.mutate({ petId1: '1', petId2: '2' });
        });

        expect(submit).toHaveBeenCalledWith(expect.objectContaining({ roomId: 'room_1' }));
    });

    it('reports the battle id as the identifier, in place of a tx hash', async () => {
        const { result } = renderHook(() => useBattlePets());
        await act(async () => {
            await result.current.mutate({ petId1: '1', petId2: '2' });
        });

        expect(result.current.hash).toBe('btl_0001');
    });

    it('stays idle when the submission was refused', async () => {
        submit.mockResolvedValue(null);
        const { result } = renderHook(() => useBattlePets());

        await act(async () => {
            await result.current.mutate({ petId1: '1', petId2: '2' });
        });

        expect(result.current.hash).toBeUndefined();
        expect(result.current.phase).toBe('idle');
    });
});

describe('phases', () => {
    it.each([
        ['committed', 'awaiting-vrf'],
        ['seeded', 'awaiting-vrf'],
        ['computed', 'resolving'],
        ['verified', 'resolving'],
        ['verification_failed', 'error'],
        ['forfeited', 'error'],
        ['rejected', 'error'],
    ])('maps %s to %s', (state, expected) => {
        backendBattle.current = { data: { state }, isSettled: false, error: null };
        const { result } = renderHook(() => useBattlePets());
        expect(result.current.phase).toBe(expected);
    });

    it('treats the wait for the committed drand round as awaiting-vrf', () => {
        // The backend-mode analogue of the old VRF wait, so the existing UI copy
        // ("Awaiting randomness…") stays accurate.
        backendBattle.current = { data: { state: 'committed' }, isSettled: false, error: null };
        const { result } = renderHook(() => useBattlePets());
        expect(result.current.isAwaitingVrf).toBe(true);
    });

    it('reports error when the submission itself failed', () => {
        submitState.error = new Error('daily-cap-reached');
        const { result } = renderHook(() => useBattlePets());
        expect(result.current.phase).toBe('error');
        expect(result.current.error?.message).toBe('daily-cap-reached');
    });
});

describe('the verified result', () => {
    it('produces no outcome until every check passes', () => {
        // The whole point: an unverified receipt animates nothing.
        backendBattle.current = settledWith('signed');
        verified.current = { data: { verified: false, receipt: receipt(), outcome: null, checks: [] }, error: null };

        const { result } = renderHook(() => useBattlePets());

        expect(result.current.result).toBeNull();
        expect(result.current.liveReplay).toBeNull();
    });

    it('maps a verified receipt onto the result the UI renders', () => {
        backendBattle.current = settledWith('signed');
        verified.current = {
            data: { verified: true, receipt: receipt(true), outcome: { log: [] }, checks: [] },
            error: null,
        };

        const { result } = renderHook(() => useBattlePets());

        expect(result.current.result).toEqual({
            requestId: 0n,
            winnerId: 1n,
            loserId: 2n,
            vrfSeed: 5n,
            firstWins: true,
            rounds: 7,
            winnerHpRemaining: 42,
            xpWin: 100,
            xpLoss: 25,
        });
    });

    it('swaps winner and loser when the defender won', () => {
        backendBattle.current = settledWith('signed');
        verified.current = {
            data: { verified: true, receipt: receipt(false), outcome: { log: [] }, checks: [] },
            error: null,
        };

        const { result } = renderHook(() => useBattlePets());

        expect(result.current.result).toMatchObject({ firstWins: false, winnerId: 2n, loserId: 1n, xpWin: 100 });
    });

    it('animates the verified replay, which is the same computation as the result', () => {
        backendBattle.current = settledWith('signed');
        const outcome = { log: [{ round: 1 }] };
        verified.current = { data: { verified: true, receipt: receipt(), outcome, checks: [] }, error: null };

        const { result } = renderHook(() => useBattlePets());

        expect(result.current.liveReplay).toBe(outcome);
        expect(result.current.phase).toBe('resolved');
    });

    it('fires onSuccess once when the verified result lands', async () => {
        const onSuccess = vi.fn();
        backendBattle.current = settledWith('signed');
        verified.current = {
            data: { verified: true, receipt: receipt(), outcome: { log: [] }, checks: [] },
            error: null,
        };

        const { result, rerender } = renderHook(() => useBattlePets({ onSuccess }));
        await act(async () => {
            await result.current.mutate({ petId1: '1', petId2: '2' });
        });
        rerender();
        rerender();

        expect(onSuccess).toHaveBeenCalledTimes(1);
        expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ firstWins: true }));
    });

    it('exposes the individual checks, so a UI can show why a result is trusted', () => {
        backendBattle.current = settledWith('signed');
        const checks = [{ check: 'beacon-signature', ok: true }];
        verified.current = { data: { verified: true, receipt: receipt(), outcome: { log: [] }, checks }, error: null };

        const { result } = renderHook(() => useBattlePets());

        expect(result.current.checks).toBe(checks);
    });
});

describe('reset', () => {
    it('clears the battle so a new one can start', async () => {
        const { result } = renderHook(() => useBattlePets());
        await act(async () => {
            await result.current.mutate({ petId1: '1', petId2: '2' });
        });
        expect(result.current.hash).toBe('btl_0001');

        act(() => result.current.reset());

        expect(result.current.hash).toBeUndefined();
        expect(result.current.phase).toBe('idle');
    });

    it('clearErrors is the same reset', () => {
        const { result } = renderHook(() => useBattlePets());
        expect(result.current.clearErrors).toBe(result.current.reset);
    });
});
