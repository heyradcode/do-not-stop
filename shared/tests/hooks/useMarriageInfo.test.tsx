// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const ZERO = '0x0000000000000000000000000000000000000000';
const reads: Record<string, unknown> = {
    marriageOf: undefined,
    marriageProposal: undefined,
    marriageCooldownUntil: undefined,
};
vi.mock('wagmi', () => ({
    useReadContract: ({ functionName }: { functionName: string }) => ({
        data: reads[functionName],
        isLoading: false,
        refetch: vi.fn(),
    }),
}));

const config: { evm: unknown } = { evm: { petCore: { address: '0xcore', abi: [] } } };
vi.mock('../../src/contexts/PetsConfigContext', () => ({ usePetsConfig: () => config }));

import { useMarriageInfo } from '../../src/hooks/chains/ethereum/useMarriageInfo';

const future = BigInt(Math.floor(Date.now() / 1000) + 10_000);
const past = BigInt(Math.floor(Date.now() / 1000) - 10_000);

beforeEach(() => {
    Object.assign(reads, { marriageOf: undefined, marriageProposal: undefined, marriageCooldownUntil: undefined });
    config.evm = { petCore: { address: '0xcore', abi: [] } };
});

describe('useMarriageInfo', () => {
    it('reports an active marriage', () => {
        reads.marriageOf = [5n, '0xspouseOwner'];
        const { result } = renderHook(() => useMarriageInfo('1'));

        expect(result.current.isMarried).toBe(true);
        expect(result.current.spouseId).toBe(5n);
        expect(result.current.ownerSnapshot).toBe('0xspouseOwner');
    });

    it('reports no marriage for a zero spouse id', () => {
        reads.marriageOf = [0n, ZERO];
        const { result } = renderHook(() => useMarriageInfo('1'));
        expect(result.current.isMarried).toBe(false);
    });

    it('flags a live proposal', () => {
        reads.marriageProposal = [9n, '0xproposer', future];
        const { result } = renderHook(() => useMarriageInfo('1'));

        expect(result.current.hasProposal).toBe(true);
        expect(result.current.proposalPetIdB).toBe(9n);
        expect(result.current.proposer).toBe('0xproposer');
    });

    it('ignores an expired proposal', () => {
        reads.marriageProposal = [9n, '0xproposer', past];
        const { result } = renderHook(() => useMarriageInfo('1'));
        expect(result.current.hasProposal).toBe(false);
    });

    it('ignores a zero-address proposer', () => {
        reads.marriageProposal = [9n, ZERO, future];
        const { result } = renderHook(() => useMarriageInfo('1'));
        expect(result.current.hasProposal).toBe(false);
    });

    it('exposes the remarriage cooldown', () => {
        reads.marriageCooldownUntil = 42n;
        const { result } = renderHook(() => useMarriageInfo('1'));
        expect(result.current.cooldownUntil).toBe(42n);
    });

    it('is inert when not on an EVM chain', () => {
        config.evm = undefined;
        const { result } = renderHook(() => useMarriageInfo('1'));
        expect(result.current.isMarried).toBe(false);
        expect(result.current.hasProposal).toBe(false);
    });
});
