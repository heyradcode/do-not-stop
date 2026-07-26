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
    pets: [
        {
            name: 'Sparky',
            dna: 42n,
            level: 5n,
            readyTime: 0n,
            winCount: 1n,
            lossCount: 0n,
            rarity: 2n,
        },
    ] as unknown[],
    petIds: [7n] as bigint[],
    address: '0xwallet' as `0x${string}` | null,
    isConnected: true,
    isLoading: false,
    contractError: null as unknown,
    refetchPetIds: vi.fn(),
    refetchPetsData: vi.fn(),
};
const fees = {
    nextMintFee: 10n,
    levelUpFee: 2n,
    trainFee: 3n,
    breedFee: 4n,
    studFee: 5n,
    battleFee: 1n,
    entropyFee: 0n,
};
const config: {
    evm:
        | {
            petCore: { address?: `0x${string}`; abi: unknown[] };
            gameLogic: { address?: `0x${string}`; abi: unknown[] };
            gameConfig?: { address?: `0x${string}`; abi: unknown[] };
        }
        | null;
} = {
    evm: {
        petCore: { address: '0x1111111111111111111111111111111111111111', abi: [] },
        gameLogic: { address: '0x2222222222222222222222222222222222222222', abi: [] },
        gameConfig: { address: '0x3333333333333333333333333333333333333333', abi: [] },
    },
};

vi.mock('wagmi', () => ({
    useWriteContract: () => write,
    useWaitForTransactionReceipt: () => receipt,
}));
vi.mock('../../src/hooks/chains/ethereum/usePetsContract', () => ({ usePetsContract: () => reads }));
vi.mock('../../src/hooks/chains/ethereum/useEvmFees', () => ({ useEvmFees: () => fees }));
vi.mock('../../src/contexts/PetsConfigContext', () => ({ usePetsConfig: () => config }));

import { EVM_CAPABILITIES, useEvmAdapter } from '../../src/hooks/adapters/useEvmAdapter';

const VALID_ADDR = `0x${'1'.repeat(40)}`;

beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(write, { isPending: false, data: undefined, error: null });
    Object.assign(receipt, { isSuccess: false, isError: false, error: null });
    Object.assign(reads, { address: '0xwallet', isConnected: true, isLoading: false, contractError: null });
    Object.assign(fees, {
        nextMintFee: 10n,
        levelUpFee: 2n,
        trainFee: 3n,
        breedFee: 4n,
        studFee: 5n,
        entropyFee: 0n,
    });
    config.evm = {
        petCore: { address: '0x1111111111111111111111111111111111111111', abi: [] },
        gameLogic: { address: '0x2222222222222222222222222222222222222222', abi: [] },
        gameConfig: { address: '0x3333333333333333333333333333333333333333', abi: [] },
    };
});

describe('EVM_CAPABILITIES', () => {
    it('describes the Ethereum chain', () => {
        expect(EVM_CAPABILITIES.chainLabel).toBe('Ethereum');
        expect(EVM_CAPABILITIES.renameMinLevel).toBe(2);
        expect(EVM_CAPABILITIES.levelUpFee).toEqual({ amount: '0.004', symbol: 'ETH' });
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
        expect(result.current.pets.data[0]).toMatchObject({
            id: '7',
            chain: 'evm',
            name: 'Sparky',
            level: 5,
        });
    });

    it('maps PetCore mutations to their v2 contract calls', async () => {
        const { result } = renderHook(() => useEvmAdapter({ enabled: true }));

        await result.current.createPet.mutateAsync({ name: 'Sparky' });
        expect(write.writeContractAsync).toHaveBeenCalledWith(
            expect.objectContaining({
                address: '0x2222222222222222222222222222222222222222',
                functionName: 'requestMintStarter',
                args: ['Sparky'],
                value: 10n,
            }),
        );

        await result.current.levelUpPet.mutateAsync({ petId: '5' });
        expect(write.writeContractAsync).toHaveBeenCalledWith(
            expect.objectContaining({
                address: '0x1111111111111111111111111111111111111111',
                functionName: 'levelUp',
                args: [5n],
                value: 2n,
            }),
        );

        await result.current.renamePet.mutateAsync({ petId: '5', name: 'New Name' });
        expect(write.writeContractAsync).toHaveBeenCalledWith(
            expect.objectContaining({
                address: '0x1111111111111111111111111111111111111111',
                functionName: 'changeName',
                args: [5n, 'New Name'],
            }),
        );

        await result.current.transferPet.mutateAsync({ petId: '5', to: '0xto' });
        expect(write.writeContractAsync).toHaveBeenCalledWith(
            expect.objectContaining({
                address: '0x1111111111111111111111111111111111111111',
                functionName: 'transferFrom',
                args: ['0xwallet', '0xto', 5n],
            }),
        );
    });

    it('maps GameLogic mutations to their v2 contract calls', async () => {
        const { result } = renderHook(() => useEvmAdapter({ enabled: true }));

        await result.current.breedPets.mutateAsync({ parentId1: '1', parentId2: '2', name: 'Baby' });
        expect(write.writeContractAsync).toHaveBeenCalledWith(
            expect.objectContaining({
                address: '0x2222222222222222222222222222222222222222',
                functionName: 'requestCreateFromDNA',
                args: [1n, 2n, 'Baby'],
                value: 4n,
                gas: 800000n,
            }),
        );
    });

    it('throws when the contract is not configured', async () => {
        config.evm = null;
        const { result } = renderHook(() => useEvmAdapter({ enabled: true }));

        await expect(result.current.createPet.mutateAsync({ name: 'X' })).rejects.toThrow(
            'EVM contract not configured',
        );
    });

    it('requires loaded fees for payable actions', async () => {
        fees.nextMintFee = undefined as unknown as bigint;
        const { result } = renderHook(() => useEvmAdapter({ enabled: true }));

        await expect(result.current.createPet.mutateAsync({ name: 'X' })).rejects.toThrow(
            'Mint fee not loaded yet',
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
