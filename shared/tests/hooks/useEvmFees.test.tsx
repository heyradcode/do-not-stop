// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const reads: Record<string, bigint | undefined> = {
    baseMintFee: 100n,
    levelUpFee: 5n,
    breedFee: 7n,
    battleFee: 6n,
    trainFee: 3n,
    studFee: 9n,
    walletMintCount: 2n,
};
const account = { address: '0xabc' as `0x${string}` | undefined };
vi.mock('wagmi', () => ({
    useAccount: () => account,
    useReadContract: ({ functionName }: { functionName: string }) => ({ data: reads[functionName] }),
}));

const config: { evm: unknown } = {
    evm: {
        gameConfig: { address: '0xcfg', abi: [] },
        petCore: { address: '0xcore', abi: [] },
    },
};
vi.mock('../../src/contexts/PetsConfigContext', () => ({ usePetsConfig: () => config }));

import { useEvmFees } from '../../src/hooks/chains/ethereum/useEvmFees';

beforeEach(() => {
    account.address = '0xabc';
    Object.assign(reads, { baseMintFee: 100n, levelUpFee: 5n, breedFee: 7n, battleFee: 6n, trainFee: 3n, studFee: 9n, walletMintCount: 2n });
});

describe('useEvmFees', () => {
    it('surfaces the on-chain fee schedule', () => {
        const { result } = renderHook(() => useEvmFees(true));

        expect(result.current.baseMintFee).toBe(100n);
        expect(result.current.levelUpFee).toBe(5n);
        expect(result.current.breedFee).toBe(7n);
        expect(result.current.battleFee).toBe(6n);
        expect(result.current.trainFee).toBe(3n);
        expect(result.current.studFee).toBe(9n);
        expect(result.current.walletMintCount).toBe(2n);
    });

    it('escalates the next mint fee by the wallet mint count', () => {
        // base * (1 + mintCount) = 100 * 3
        const { result } = renderHook(() => useEvmFees(true));
        expect(result.current.nextMintFee).toBe(300n);
    });

    it('leaves nextMintFee undefined when the base or count is missing', () => {
        reads.walletMintCount = undefined;
        const { result } = renderHook(() => useEvmFees(true));
        expect(result.current.nextMintFee).toBeUndefined();
    });
});
