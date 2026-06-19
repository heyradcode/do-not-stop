// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const readContract = { data: undefined as bigint | undefined, refetch: vi.fn() };
const settleW = { writeContractAsync: vi.fn().mockResolvedValue('0xs'), isPending: false, data: undefined, error: null };
const cancelW = { writeContractAsync: vi.fn().mockResolvedValue('0xc'), isPending: false, data: undefined, error: null };
const writeQueue = [settleW, cancelW];
let writeIdx = 0;

vi.mock('wagmi', () => ({
    useAccount: () => ({ address: '0xowner' }),
    useReadContract: () => readContract,
    useSimulateContract: () => ({ isSuccess: false }),
    useWriteContract: () => writeQueue[writeIdx++ % 2],
    useWaitForTransactionReceipt: () => ({ isSuccess: false, isError: false, error: null }),
}));

const config: { evm: unknown } = { evm: { gameLogic: { address: '0xlogic', abi: [] } } };
vi.mock('../../src/contexts/PetsConfigContext', () => ({ usePetsConfig: () => config }));

import { usePendingBattle } from '../../src/hooks/chains/ethereum/usePendingBattle';

beforeEach(() => {
    vi.clearAllMocks();
    writeIdx = 0;
    readContract.data = undefined;
    config.evm = { gameLogic: { address: '0xlogic', abi: [] } };
});

describe('usePendingBattle', () => {
    it('is not pending when the request id is zero', () => {
        readContract.data = 0n;
        const { result } = renderHook(() => usePendingBattle('1'));
        expect(result.current.isPending).toBe(false);
    });

    it('is pending with a non-zero request id', () => {
        readContract.data = 5n;
        const { result } = renderHook(() => usePendingBattle('1'));
        expect(result.current.isPending).toBe(true);
        expect(result.current.requestId).toBe(5n);
    });

    it('settles the open battle by request id', async () => {
        readContract.data = 5n;
        const { result } = renderHook(() => usePendingBattle('1'));

        await result.current.settle.run();
        expect(settleW.writeContractAsync).toHaveBeenCalledWith(
            expect.objectContaining({ functionName: 'settleBattle', args: [5n] }),
        );
    });

    it('cancels the open battle by request id', async () => {
        readContract.data = 5n;
        const { result } = renderHook(() => usePendingBattle('1'));

        await result.current.cancel.run();
        expect(cancelW.writeContractAsync).toHaveBeenCalledWith(
            expect.objectContaining({ functionName: 'cancelBattle', args: [5n] }),
        );
    });

    it('throws when there is nothing to settle', async () => {
        readContract.data = undefined;
        const { result } = renderHook(() => usePendingBattle('1'));
        await expect(result.current.settle.run()).rejects.toThrow('No pending battle to settle');
    });

    it('is inert when not on an EVM chain', () => {
        config.evm = undefined;
        const { result } = renderHook(() => usePendingBattle('1'));
        expect(result.current.isPending).toBe(false);
        expect(result.current.requestId).toBeUndefined();
    });
});
