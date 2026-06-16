// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const battlePets = {
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
    lifecycle: { phase: 'idle', hash: '0xhash', error: null as Error | null, reset: vi.fn() },
};
const adapter = { battlePets };

let txSuccessArgs: [unknown, () => void] | undefined;
vi.mock('../../src/hooks/adapters/useChainAdapter', () => ({ useChainAdapter: () => adapter }));
vi.mock('../../src/hooks/useTxSuccess', () => ({
    useTxSuccess: (lifecycle: unknown, cb: () => void) => {
        txSuccessArgs = [lifecycle, cb];
    },
}));
// EVM-only async battle flow; stub it so the hook stays chain-agnostic here.
vi.mock('../../src/hooks/chains/ethereum/useEvmBattleFlow', () => ({
    useEvmBattleFlow: () => ({ reset: vi.fn() }),
}));

import { useBattlePets } from '../../src/hooks/useBattlePets';

beforeEach(() => {
    vi.clearAllMocks();
    battlePets.isPending = false;
    battlePets.lifecycle.phase = 'idle';
    battlePets.lifecycle.error = null;
});

describe('useBattlePets', () => {
    it('maps args to the adapter mutation', async () => {
        const { result } = renderHook(() => useBattlePets());

        await act(async () => {
            await result.current.mutate({ petId1: 'a', petId2: 'b', defenderOwner: '0xowner' });
        });

        expect(battlePets.mutateAsync).toHaveBeenCalledWith({
            petId1: 'a',
            petId2: 'b',
            defenderOwner: '0xowner',
        });
    });

    it('swallows mutation errors (tracked on the lifecycle instead)', async () => {
        battlePets.mutateAsync.mockRejectedValueOnce(new Error('boom'));
        const { result } = renderHook(() => useBattlePets());

        await act(async () => {
            await expect(
                result.current.mutate({ petId1: 'a', petId2: 'b' }),
            ).resolves.toBeUndefined();
        });
    });

    it('reflects lifecycle state', () => {
        battlePets.isPending = true;
        battlePets.lifecycle.phase = 'confirming';
        battlePets.lifecycle.error = new Error('x');

        const { result } = renderHook(() => useBattlePets());
        expect(result.current.isPending).toBe(true);
        expect(result.current.isConfirming).toBe(true);
        expect(result.current.hash).toBe('0xhash');
        expect(result.current.error?.message).toBe('x');
    });

    it('reset and clearErrors both reset the lifecycle', () => {
        const { result } = renderHook(() => useBattlePets());

        act(() => {
            result.current.reset();
            result.current.clearErrors();
        });

        expect(battlePets.lifecycle.reset).toHaveBeenCalledTimes(2);
    });

    it('wires onSuccess through useTxSuccess', () => {
        const onSuccess = vi.fn();
        renderHook(() => useBattlePets({ onSuccess }));

        expect(txSuccessArgs?.[0]).toBe(battlePets.lifecycle);
        // Invoking the notify callback should fan out to the latest onSuccess.
        act(() => txSuccessArgs?.[1]());
        expect(onSuccess).toHaveBeenCalledOnce();
    });
});
