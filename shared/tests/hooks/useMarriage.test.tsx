// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const account: { address: `0x${string}` | undefined } = { address: undefined };
vi.mock('wagmi', () => ({
    useAccount: () => account,
    useWriteContract: () => makeWrite(),
    useWaitForTransactionReceipt: () => ({ isLoading: false }),
}));

const config: { evm: unknown } = {
    evm: { petCore: { address: '0xcore' as `0x${string}`, abi: [] } },
};
vi.mock('../../src/contexts/PetsConfigContext', () => ({ usePetsConfig: () => config }));

// Each useWriteContract call needs its own write fn; track calls in order.
const writes: Array<{ writeContractAsync: ReturnType<typeof vi.fn>; isPending: boolean; error: null; data: undefined; reset: ReturnType<typeof vi.fn> }> = [];
let writeIdx = 0;
function makeWrite() {
    if (!writes[writeIdx]) {
        writes[writeIdx] = {
            writeContractAsync: vi.fn().mockResolvedValue('0xhash'),
            isPending: false,
            error: null,
            data: undefined,
            reset: vi.fn(),
        };
    }
    return writes[writeIdx++];
}

import { useMarriage } from '../../src/hooks/chains/ethereum/useMarriage';

beforeEach(() => {
    vi.clearAllMocks();
    writes.length = 0;
    writeIdx = 0;
    account.address = '0xwallet' as `0x${string}`;
    config.evm = { petCore: { address: '0xcore' as `0x${string}`, abi: [] } };
});

describe('useMarriage', () => {
    it('exposes canWrite=true when wallet and petCore are set', () => {
        const { result } = renderHook(() => useMarriage());
        expect(result.current.canWrite).toBe(true);
    });

    it('canWrite=false without a wallet', () => {
        account.address = undefined;
        const { result } = renderHook(() => useMarriage());
        expect(result.current.canWrite).toBe(false);
    });

    it('canWrite=false without EVM config', () => {
        config.evm = undefined;
        const { result } = renderHook(() => useMarriage());
        expect(result.current.canWrite).toBe(false);
    });

    it('proposeMarriage calls writeContractAsync with correct functionName and bigint args', async () => {
        const { result } = renderHook(() => useMarriage());
        await act(async () => {
            await result.current.propose.mutateAsync({ petIdA: '1', petIdB: '2' });
        });
        expect(writes[0].writeContractAsync).toHaveBeenCalledWith(
            expect.objectContaining({ functionName: 'proposeMarriage', args: [1n, 2n] }),
        );
    });

    it('acceptMarriage calls writeContractAsync with correct functionName', async () => {
        const { result } = renderHook(() => useMarriage());
        await act(async () => {
            await result.current.accept.mutateAsync({ petIdA: '3', petIdB: '4' });
        });
        expect(writes[1].writeContractAsync).toHaveBeenCalledWith(
            expect.objectContaining({ functionName: 'acceptMarriage', args: [3n, 4n] }),
        );
    });

    it('cancelProposal calls writeContractAsync with petIdA as bigint', async () => {
        const { result } = renderHook(() => useMarriage());
        await act(async () => {
            await result.current.cancel.mutateAsync({ petIdA: '5' });
        });
        expect(writes[2].writeContractAsync).toHaveBeenCalledWith(
            expect.objectContaining({ functionName: 'cancelProposal', args: [5n] }),
        );
    });

    it('divorce calls writeContractAsync with petId as bigint', async () => {
        const { result } = renderHook(() => useMarriage());
        await act(async () => {
            await result.current.divorce.mutateAsync({ petId: '6' });
        });
        expect(writes[3].writeContractAsync).toHaveBeenCalledWith(
            expect.objectContaining({ functionName: 'divorce', args: [6n] }),
        );
    });

    it('proposeMarriage throws when canWrite is false', async () => {
        account.address = undefined;
        const { result } = renderHook(() => useMarriage());
        await expect(
            result.current.propose.mutateAsync({ petIdA: '1', petIdB: '2' }),
        ).rejects.toThrow('Marriage is only available on EVM');
    });

    it('resetAll resets all four write hooks', () => {
        const { result } = renderHook(() => useMarriage());
        act(() => { result.current.resetAll(); });
        for (const w of writes) {
            expect(w.reset).toHaveBeenCalledOnce();
        }
    });
});
