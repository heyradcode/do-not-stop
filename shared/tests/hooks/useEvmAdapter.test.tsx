// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const write = {
    writeContractAsync: vi.fn().mockResolvedValue('0xhash'),
    isPending: false,
    data: undefined as `0x${string}` | undefined,
    error: null as unknown,
    reset: vi.fn(),
};
const receipt = { isSuccess: false, isError: false, error: null as unknown };
const reads = {
    pets: [] as unknown[],
    petIds: [] as bigint[],
    address: '0xwallet' as `0x${string}` | null,
    isConnected: true,
    isLoading: false,
    contractError: null as unknown,
    refetchPetIds: vi.fn(),
    refetchPetsData: vi.fn(),
};
const config: { evm: { contractAddress?: string; abi: unknown[] } | undefined } = {
    evm: { contractAddress: '0xcontract', abi: [] },
};

vi.mock('wagmi', () => ({
    useWriteContract: () => write,
    useWaitForTransactionReceipt: () => receipt,
}));
vi.mock('../../src/hooks/chains/ethereum/usePetsContract', () => ({ usePetsContract: () => reads }));
vi.mock('../../src/contexts/PetsConfigContext', () => ({ usePetsConfig: () => config }));

import { EVM_CAPABILITIES, useEvmAdapter } from '../../src/hooks/adapters/useEvmAdapter';

const VALID_ADDR = `0x${'1'.repeat(40)}`;

beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(write, { isPending: false, data: undefined, error: null });
    Object.assign(receipt, { isSuccess: false, isError: false, error: null });
    Object.assign(reads, { address: '0xwallet', isConnected: true });
    config.evm = { contractAddress: '0xcontract', abi: [] };
});

describe('EVM_CAPABILITIES', () => {
    it('describes the Ethereum chain', () => {
        expect(EVM_CAPABILITIES.chainLabel).toBe('Ethereum');
        expect(EVM_CAPABILITIES.renameMinLevel).toBe(2);
        expect(EVM_CAPABILITIES.levelUpFee).toEqual({ amount: '0.001', symbol: 'ETH' });
    });

    it('validates addresses via viem', () => {
        expect(EVM_CAPABILITIES.address.isValid(VALID_ADDR)).toBe(true);
        expect(EVM_CAPABILITIES.address.isValid('not-an-address')).toBe(false);
    });

    it('parses contract errors', () => {
        expect(EVM_CAPABILITIES.parseError(new Error('User rejected'), 'fb').isUserRejection).toBe(true);
    });
});

describe('useEvmAdapter', () => {
    it('reports connected evm context', () => {
        const { result } = renderHook(() => useEvmAdapter({ enabled: true }));
        expect(result.current.kind).toBe('evm');
        expect(result.current.isConnected).toBe(true);
        expect(result.current.address).toBe('0xwallet');
        expect(result.current.capabilities).toBe(EVM_CAPABILITIES);
    });

    it('maps each mutation to its contract call', async () => {
        const { result } = renderHook(() => useEvmAdapter({ enabled: true }));

        await result.current.createPet.mutateAsync({ name: 'Sparky' });
        expect(write.writeContractAsync).toHaveBeenCalledWith(
            expect.objectContaining({ functionName: 'createRandom', args: ['Sparky'] }),
        );

        await result.current.levelUpPet.mutateAsync({ petId: '5' });
        expect(write.writeContractAsync).toHaveBeenCalledWith(
            expect.objectContaining({ functionName: 'levelUp', args: [5n] }),
        );

        await result.current.transferPet.mutateAsync({ petId: '5', to: '0xto' });
        expect(write.writeContractAsync).toHaveBeenCalledWith(
            expect.objectContaining({ functionName: 'transferFrom', args: ['0xwallet', '0xto', 5n] }),
        );
    });

    it('throws when the contract is not configured', async () => {
        config.evm = undefined;
        const { result } = renderHook(() => useEvmAdapter({ enabled: true }));

        await expect(result.current.createPet.mutateAsync({ name: 'X' })).rejects.toThrow(
            'EVM contract not configured',
        );
    });

    it('derives the lifecycle phase from write/receipt state', () => {
        const idle = renderHook(() => useEvmAdapter({ enabled: true }));
        expect(idle.result.current.createPet.lifecycle.phase).toBe('idle');

        write.data = '0xhash';
        const confirming = renderHook(() => useEvmAdapter({ enabled: true }));
        expect(confirming.result.current.createPet.lifecycle.phase).toBe('confirming');
        expect(confirming.result.current.createPet.isPending).toBe(true);

        receipt.isSuccess = true;
        const success = renderHook(() => useEvmAdapter({ enabled: true }));
        expect(success.result.current.createPet.lifecycle.phase).toBe('success');

        receipt.isSuccess = false;
        write.error = new Error('reverted');
        const errored = renderHook(() => useEvmAdapter({ enabled: true }));
        expect(errored.result.current.createPet.lifecycle.phase).toBe('error');
    });
});
