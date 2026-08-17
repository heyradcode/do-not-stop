// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const account: { address: `0x${string}` | undefined } = { address: undefined };

/**
 * Mined-and-succeeded by default. Every action now waits for its receipt before resolving,
 * so a mock without this would leave each `mutateAsync` pending forever.
 */
const receipt: { status: 'success' | 'reverted' } = { status: 'success' };
const waitForTransactionReceipt = vi.fn(async () => receipt);
/** Null models a chain with no client configured, where there is nothing to wait on. */
const publicClient: { current: unknown } = { current: { waitForTransactionReceipt } };

vi.mock('wagmi', () => ({
    useAccount: () => account,
    usePublicClient: () => publicClient.current,
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
    receipt.status = 'success';
    publicClient.current = { waitForTransactionReceipt };
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

    /*
     * Callers treat `mutateAsync` resolving as "done" — they show a success message and
     * invalidate the contract read caches. Resolving at submission meant those reads ran
     * against a transaction still in the mempool, cached the pre-confirmation answer, and
     * never invalidated again once the receipt landed. A marriage that succeeded on chain
     * therefore stayed invisible until the screen remounted, intermittently, because it is
     * a race with block time.
     */
    describe('waiting for the receipt', () => {
        it('does not resolve until the transaction is mined', async () => {
            let mined!: (r: { status: 'success' }) => void;
            waitForTransactionReceipt.mockReturnValueOnce(
                new Promise((resolve) => { mined = resolve as typeof mined; }) as never,
            );

            const { result } = renderHook(() => useMarriage());
            let settled = false;
            await act(async () => {
                void result.current.propose
                    .mutateAsync({ petIdA: '1', petIdB: '2' })
                    .then(() => { settled = true; });
            });

            expect(writes[0].writeContractAsync).toHaveBeenCalled();
            expect(settled).toBe(false);

            await act(async () => { mined({ status: 'success' }); });
            expect(settled).toBe(true);
        });

        it('waits on the hash the write returned', async () => {
            const { result } = renderHook(() => useMarriage());
            await act(async () => {
                await result.current.accept.mutateAsync({ petIdA: '3', petIdB: '4' });
            });
            expect(waitForTransactionReceipt).toHaveBeenCalledWith({ hash: '0xhash' });
        });

        /*
         * A revert is still mined, so waiting alone would report it as success. This is how
         * an acceptMarriage that reverted with "Proposal expired" still produced
         * "Marriage accepted!" in the UI.
         */
        it('throws when the transaction reverted, rather than reporting success', async () => {
            receipt.status = 'reverted';
            const { result } = renderHook(() => useMarriage());
            await expect(
                result.current.accept.mutateAsync({ petIdA: '3', petIdB: '4' }),
            ).rejects.toThrow('acceptMarriage was mined but reverted');
        });

        it('still sends the write when no client is configured for the chain', async () => {
            publicClient.current = null;
            const { result } = renderHook(() => useMarriage());
            await act(async () => {
                await result.current.divorce.mutateAsync({ petId: '6' });
            });
            expect(writes[3].writeContractAsync).toHaveBeenCalled();
            expect(waitForTransactionReceipt).not.toHaveBeenCalled();
        });
    });

    it('resetAll resets all four write hooks', () => {
        const { result } = renderHook(() => useMarriage());
        act(() => { result.current.resetAll(); });
        for (const w of writes) {
            expect(w.reset).toHaveBeenCalledOnce();
        }
    });
});
