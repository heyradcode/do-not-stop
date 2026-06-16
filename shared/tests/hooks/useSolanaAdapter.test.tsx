// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { Keypair } from '@solana/web3.js';

const makeMutation = () => ({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
    isSuccess: false,
    isError: false,
    error: null as Error | null,
    data: undefined as string | undefined,
    reset: vi.fn(),
});

const actions = {
    createStarterPet: makeMutation(),
    levelUpPet: makeMutation(),
    renamePet: makeMutation(),
    transferPet: makeMutation(),
    battlePets: makeMutation(),
    breedPets: makeMutation(),
};
const petsQuery = { data: [], isLoading: false, isFetching: false, error: null, refetch: vi.fn() };
const anchor = { signingWallet: { publicKey: Keypair.generate().publicKey } as { publicKey: unknown } | null };

vi.mock('../../src/hooks/chains/solana/usePetActions', () => ({ usePetActions: () => actions }));
vi.mock('../../src/hooks/chains/solana/usePets', () => ({ usePets: () => petsQuery }));
vi.mock('../../src/contexts/SolanaAnchorContext', () => ({ useSolanaAnchor: () => anchor }));
// Barrel pulls the crash-on-load Switchboard builders — expose only the real
// error formatter from its own (Switchboard-free) module.
vi.mock('../../src/utils/solana', async () => {
    const mod = await import('../../src/utils/solana/parseSolanaTransactionError');
    return { formatSolanaActionError: mod.formatSolanaActionError };
});

import { SOLANA_CAPABILITIES, useSolanaAdapter } from '../../src/hooks/adapters/useSolanaAdapter';

const validAddress = Keypair.generate().publicKey.toBase58();

beforeEach(() => {
    vi.clearAllMocks();
    Object.values(actions).forEach((m) =>
        Object.assign(m, { isPending: false, isSuccess: false, isError: false, error: null, data: undefined }),
    );
    anchor.signingWallet = { publicKey: Keypair.generate().publicKey };
});

describe('SOLANA_CAPABILITIES', () => {
    it('describes the Solana chain', () => {
        expect(SOLANA_CAPABILITIES.chainLabel).toBe('Solana');
        expect(SOLANA_CAPABILITIES.renameMinLevel).toBe(1);
        expect(SOLANA_CAPABILITIES.levelUpFee).toBeNull();
        expect(SOLANA_CAPABILITIES.randomness.provider).toBe('switchboard');
    });

    it('validates base58 addresses', () => {
        expect(SOLANA_CAPABILITIES.address.isValid(validAddress)).toBe(true);
        expect(SOLANA_CAPABILITIES.address.isValid('not-base58!!')).toBe(false);
    });

    it('parses errors as contract errors with a message', () => {
        const parsed = SOLANA_CAPABILITIES.parseError(new Error('boom'), 'fallback');
        expect(parsed.isContractError).toBe(true);
        expect(typeof parsed.message).toBe('string');
    });
});

describe('useSolanaAdapter', () => {
    it('reports connected solana context', () => {
        const { result } = renderHook(() => useSolanaAdapter({ enabled: true }));
        expect(result.current.kind).toBe('solana');
        expect(result.current.isConnected).toBe(true);
        expect(result.current.address).toBe(anchor.signingWallet!.publicKey.toString());
        expect(result.current.capabilities).toBe(SOLANA_CAPABILITIES);
    });

    it('is disconnected without a signing wallet', () => {
        anchor.signingWallet = null;
        const { result } = renderHook(() => useSolanaAdapter({ enabled: true }));
        expect(result.current.isConnected).toBe(false);
        expect(result.current.address).toBeNull();
    });

    it('maps mutations to pet actions with numeric ids and defaults', async () => {
        const { result } = renderHook(() => useSolanaAdapter({ enabled: true }));

        await result.current.createPet.mutateAsync({ name: 'S' });
        expect(actions.createStarterPet.mutateAsync).toHaveBeenCalledWith({ name: 'S', dna: 0n, rarity: 1 });

        await result.current.levelUpPet.mutateAsync({ petId: '5' });
        expect(actions.levelUpPet.mutateAsync).toHaveBeenCalledWith({ petId: 5 });

        await result.current.breedPets.mutateAsync({ parentId1: '1', parentId2: '2', name: 'Baby' });
        expect(actions.breedPets.mutateAsync).toHaveBeenCalledWith({ parent1Id: 1, parent2Id: 2, name: 'Baby' });
    });

    it('includes defenderOwner only when provided', async () => {
        const { result } = renderHook(() => useSolanaAdapter({ enabled: true }));

        await result.current.battlePets.mutateAsync({ petId1: '1', petId2: '2' });
        expect(actions.battlePets.mutateAsync).toHaveBeenCalledWith({ attackerPetId: 1, defenderPetId: 2 });

        await result.current.battlePets.mutateAsync({ petId1: '1', petId2: '2', defenderOwner: '0xo' });
        expect(actions.battlePets.mutateAsync).toHaveBeenLastCalledWith({
            attackerPetId: 1,
            defenderPetId: 2,
            defenderOwner: '0xo',
        });
    });

    it('derives the lifecycle phase from the action mutation state', () => {
        actions.createStarterPet.isPending = true;
        let hook = renderHook(() => useSolanaAdapter({ enabled: true }));
        expect(hook.result.current.createPet.lifecycle.phase).toBe('awaiting-wallet');

        actions.createStarterPet.isPending = false;
        actions.createStarterPet.isSuccess = true;
        actions.createStarterPet.data = 'sig123';
        hook = renderHook(() => useSolanaAdapter({ enabled: true }));
        expect(hook.result.current.createPet.lifecycle.phase).toBe('success');
        expect(hook.result.current.createPet.lifecycle.hash).toBe('sig123');

        actions.createStarterPet.isSuccess = false;
        actions.createStarterPet.isError = true;
        hook = renderHook(() => useSolanaAdapter({ enabled: true }));
        expect(hook.result.current.createPet.lifecycle.phase).toBe('error');
    });
});
