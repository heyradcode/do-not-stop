// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const writeContractAsync = vi.fn();
const writeState = { writeContractAsync, data: undefined as string | undefined, isPending: false, error: null, reset: vi.fn() };
const receiptState = { isSuccess: false, isError: false, error: null };

vi.mock('wagmi', () => ({
    useWriteContract: () => writeState,
    useWaitForTransactionReceipt: () => receiptState,
}));

const chain = { kind: 'evm' as 'evm' | 'solana' | 'none' };
vi.mock('../../src/hooks/session/useActiveChain', () => ({ useActiveChain: () => chain }));

const config = {
    evm: {
        petCore: { address: '0xpet', abi: [] },
        gameLogic: { address: '0xlogic', abi: [] },
        itemCore: { address: '0xitem' as string | undefined, abi: [] },
        chainId: 31337,
    } as Record<string, unknown> | null,
};
vi.mock('../../src/contexts/PetsConfigContext', () => ({ usePetsConfig: () => config }));

const apiClient = { post: vi.fn(), defaults: { baseURL: 'https://api.test' } };
vi.mock('../../src/contexts/ApiClientContext', () => ({ useApiClient: () => apiClient }));

// Both chains' hooks run every render, per the rules of hooks, so the Solana ones have to be
// mocked even for the EVM cases.
const solana = {
    program: null as unknown,
    programId: null as unknown,
    signingWallet: null as { publicKey: unknown } | null,
};
vi.mock('../../src/hooks/chains/solana/useProgram', () => ({
    useProgram: () => ({ program: solana.program, programId: solana.programId }),
}));
vi.mock('../../src/contexts/SolanaAnchorContext', () => ({
    useSolanaAnchor: () => ({ signingWallet: solana.signingWallet }),
}));

const equipOnSolana = vi.fn();
const unequipOnSolana = vi.fn();
vi.mock('../../src/utils/solana/equipItem', () => ({
    equipItemOnSolana: (...args: unknown[]) => equipOnSolana(...args),
    unequipItemOnSolana: (...args: unknown[]) => unequipOnSolana(...args),
}));

import { useInventoryAdapter } from '../../src/hooks/adapters/useInventoryAdapter';
import { useEquipItem } from '../../src/hooks/inventory/useEquipItem';

const wrapper = ({ children }: { children: React.ReactNode }) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

beforeEach(() => {
    vi.clearAllMocks();
    chain.kind = 'evm';
    solana.program = null;
    solana.programId = null;
    solana.signingWallet = null;
    writeState.data = undefined;
    writeState.isPending = false;
    writeState.error = null;
    receiptState.isSuccess = false;
    receiptState.isError = false;
    (config.evm as Record<string, unknown>).itemCore = { address: '0xitem', abi: [] };
    writeContractAsync.mockResolvedValue('0xhash');
});

describe('useInventoryAdapter', () => {
    // Pet id and item type are uint256 on chain, so they cross as bigints; the slot is a
    // uint8 and stays a number.
    it('sends equip with the ids widened to bigint and the slot left a number', async () => {
        const { result } = renderHook(() => useInventoryAdapter(), { wrapper });

        await result.current.equip.mutateAsync({ petId: '7', slot: 0, itemType: '100' });

        expect(writeContractAsync).toHaveBeenCalledWith(
            expect.objectContaining({
                address: '0xitem',
                functionName: 'equip',
                args: [7n, 0, 100n],
                chainId: 31337,
            }),
        );
    });

    it('sends unequip with just the pet and slot', async () => {
        const { result } = renderHook(() => useInventoryAdapter(), { wrapper });

        await result.current.unequip.mutateAsync({ petId: '7', slot: 2 });

        expect(writeContractAsync).toHaveBeenCalledWith(
            expect.objectContaining({ functionName: 'unequip', args: [7n, 2] }),
        );
    });

    // Solana has no item contract: §4 validates the model on EVM before porting, and an
    // SPL Token-2022 mint per type is a different shape from an ERC-1155 id.
    it('reports itself disabled on Solana with no wallet connected', async () => {
        chain.kind = 'solana';
        const { result } = renderHook(() => useInventoryAdapter(), { wrapper });

        expect(result.current.kind).toBe('solana');
        expect(result.current.canEquip).toBe(false);
        await expect(result.current.equip.mutateAsync({ petId: 'AssetPubkey', slot: 0, itemType: '1' })).rejects.toThrow(
            /Connect a Solana wallet/,
        );
        expect(writeContractAsync).not.toHaveBeenCalled();
    });

    it('equips through the Solana program once a wallet is connected', async () => {
        chain.kind = 'solana';
        solana.program = {};
        solana.programId = {};
        solana.signingWallet = { publicKey: 'OwnerPubkey' };
        equipOnSolana.mockResolvedValue('sig');

        const { result } = renderHook(() => useInventoryAdapter(), { wrapper });
        expect(result.current.canEquip).toBe(true);

        await result.current.equip.mutateAsync({ petId: 'AssetPubkey', slot: 0, itemType: '1' });

        // The asset pubkey, not the numeric id: every Solana PDA here is seeded by it.
        expect(equipOnSolana.mock.calls[0]![0]).toMatchObject({ assetKey: 'AssetPubkey', slot: 0, itemType: '1' });
        expect(writeContractAsync).not.toHaveBeenCalled();
    });

    // EVM's unequip reads the slot and returns whatever is there; Solana needs the type to
    // name the balance PDA it credits, and defaulting would credit a different stack.
    it('refuses a Solana unequip with no item type rather than guessing one', async () => {
        chain.kind = 'solana';
        solana.program = {};
        solana.programId = {};
        solana.signingWallet = { publicKey: 'OwnerPubkey' };

        const { result } = renderHook(() => useInventoryAdapter(), { wrapper });

        await expect(result.current.unequip.mutateAsync({ petId: 'AssetPubkey', slot: 0 })).rejects.toThrow(
            /needs the item type/,
        );
        expect(unequipOnSolana).not.toHaveBeenCalled();
    });

    // Optional config, like GameConfig: a deployment without ItemCore still runs, and only
    // equipping goes unavailable.
    it('reports itself disabled when ItemCore is unconfigured', async () => {
        (config.evm as Record<string, unknown>).itemCore = undefined;
        const { result } = renderHook(() => useInventoryAdapter(), { wrapper });

        expect(result.current.canEquip).toBe(false);
        await expect(result.current.equip.mutateAsync({ petId: '7', slot: 0, itemType: '1' })).rejects.toThrow(
            /not configured/,
        );
    });

    it('projects the write and receipt state into one lifecycle', () => {
        writeState.isPending = true;
        const { result } = renderHook(() => useInventoryAdapter(), { wrapper });
        expect(result.current.equip.lifecycle.phase).toBe('awaiting-wallet');
        expect(result.current.equip.isPending).toBe(true);
    });

    it('reports success only once the receipt lands, not when the hash appears', () => {
        writeState.data = '0xhash';
        const { result, rerender } = renderHook(() => useInventoryAdapter(), { wrapper });
        expect(result.current.equip.lifecycle.phase).toBe('confirming');

        receiptState.isSuccess = true;
        rerender();
        expect(result.current.equip.lifecycle.phase).toBe('success');
    });
});

describe('useEquipItem', () => {
    // Equipping escrows the token, so it moves the pet's slots and the wallet's balance.
    // Refreshing only the first would leave the bag showing an item that is no longer there.
    /**
     * All three reads an equip moves. The batched one is easy to forget and its absence is
     * invisible in the equip panel itself: it only shows up as a gallery or arena badge still
     * displaying the old loadout, on a different screen, minutes later.
     */
    it('invalidates the pet equipment, the batched equipment and the inventory after a confirmed equip', async () => {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        const invalidate = vi.spyOn(client, 'invalidateQueries');
        const localWrapper = ({ children }: { children: React.ReactNode }) => (
            <QueryClientProvider client={client}>{children}</QueryClientProvider>
        );

        const { result } = renderHook(() => useEquipItem({ chain: 'evm', petId: '7' }), { wrapper: localWrapper });
        await result.current.equip(0, '100');

        await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(3));
        const keys = invalidate.mock.calls.map((call) => (call[0] as { queryKey: unknown[] }).queryKey[0]);
        expect(new Set(keys)).toEqual(new Set(['petEquipment', 'petEquipmentForPets', 'inventory']));

        // By prefix, not a full key: the cached entries are keyed by the list of pets each
        // screen asked for, and an equip does not know which lists exist.
        const batched = invalidate.mock.calls
            .map((call) => (call[0] as { queryKey: unknown[] }).queryKey)
            .find((key) => key[0] === 'petEquipmentForPets');
        expect(batched).toHaveLength(3);
    });

    it('refuses without a selected pet rather than sending a transaction', async () => {
        const { result } = renderHook(() => useEquipItem({ chain: 'evm', petId: null }), { wrapper });

        await expect(result.current.equip(0, '100')).rejects.toThrow('No pet selected');
        expect(writeContractAsync).not.toHaveBeenCalled();
    });
});
