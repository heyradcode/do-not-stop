// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { Keypair } from '@solana/web3.js';

const makeMutation = (resolvedValue: unknown = undefined) => ({
    mutateAsync: vi.fn().mockResolvedValue(resolvedValue),
    isPending: false,
    isSuccess: false,
    isError: false,
    error: null as Error | null,
    data: undefined as unknown,
    reset: vi.fn(),
});

const ASSET_1 = Keypair.generate().publicKey.toBase58();
const ASSET_2 = Keypair.generate().publicKey.toBase58();
const ASSET_5 = Keypair.generate().publicKey.toBase58();

const testPets = [
    { id: '1', chain: 'solana' as const, name: 'Alpha', dna: 0n, level: 1, rarity: 1, winCount: 0, lossCount: 0, readyAt: 0, assetKey: ASSET_1 },
    { id: '2', chain: 'solana' as const, name: 'Beta',  dna: 0n, level: 1, rarity: 1, winCount: 0, lossCount: 0, readyAt: 0, assetKey: ASSET_2 },
    { id: '5', chain: 'solana' as const, name: 'Gamma', dna: 0n, level: 2, rarity: 1, winCount: 0, lossCount: 0, readyAt: 0, assetKey: ASSET_5 },
];

const actions = {
    mintPet: makeMutation(),
    levelUpPet: makeMutation(),
    trainPet: makeMutation(),
    renamePet: makeMutation(),
    breedPets: makeMutation(),
    transferPet: makeMutation(),
    setOpenToChallenges: makeMutation(),
    syncMetadata: makeMutation(),
    withdrawStudFees: makeMutation(),
    breedSubPhase: 'idle' as 'idle' | 'awaiting-vrf',
};
const petsQuery = { data: testPets, isLoading: false, isFetching: false, error: null, refetch: vi.fn() };
const anchor = { signingWallet: { publicKey: Keypair.generate().publicKey } as { publicKey: unknown } | null };

vi.mock('../../src/hooks/chains/solana/usePetActions', () => ({ usePetActions: () => actions }));
vi.mock('../../src/hooks/chains/solana/usePets', () => ({ usePets: () => petsQuery }));
vi.mock('../../src/contexts/SolanaAnchorContext', () => ({
    useSolanaAnchor: () => ({ ...anchor, connection: { rpcEndpoint: 'https://api.devnet.solana.com' }, idlAddress: null }),
}));
vi.mock('../../src/hooks/chains/solana/useProgram', () => ({
    useProgram: () => ({ program: null, programId: null, provider: null, isConfigured: false, isLoading: false, isFetching: false, error: null, refetch: vi.fn(), isReady: false }),
}));
// Avoid loading Switchboard builders; expose only the real error formatter.
vi.mock('../../src/utils/solana', async () => {
    const mod = await import('../../src/utils/solana/parseSolanaTransactionError');
    return { formatSolanaActionError: mod.formatSolanaActionError };
});
// mapSolanaPet: return the row as-is since petsQuery.data already contains mapped Pet objects.
vi.mock('../../src/utils/pets/mapSolanaPet', () => ({
    mapSolanaPet: (row: unknown) => row,
}));

import { SOLANA_CAPABILITIES, useSolanaAdapter } from '../../src/hooks/adapters/useSolanaAdapter';

const validAddress = Keypair.generate().publicKey.toBase58();

beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(actions.mintPet,   { isPending: false, isSuccess: false, isError: false, error: null, data: undefined });
    Object.assign(actions.levelUpPet, { isPending: false, isSuccess: false, isError: false, error: null, data: undefined });
    Object.assign(actions.trainPet,   { isPending: false, isSuccess: false, isError: false, error: null, data: undefined });
    Object.assign(actions.renamePet,  { isPending: false, isSuccess: false, isError: false, error: null, data: undefined });
    Object.assign(actions.breedPets,  { isPending: false, isSuccess: false, isError: false, error: null, data: undefined });
    Object.assign(actions.transferPet, { isPending: false, isSuccess: false, isError: false, error: null, data: undefined });
    Object.assign(actions.setOpenToChallenges, { isPending: false, isSuccess: false, isError: false, error: null, data: undefined });
    Object.assign(actions.syncMetadata, { isPending: false, isSuccess: false, isError: false, error: null, data: undefined });
    Object.assign(actions.withdrawStudFees, { isPending: false, isSuccess: false, isError: false, error: null, data: undefined });
    actions.breedPets.mutateAsync.mockResolvedValue(undefined);
    actions.breedSubPhase = 'idle';
    anchor.signingWallet = { publicKey: Keypair.generate().publicKey };
});

describe('SOLANA_CAPABILITIES', () => {
    it('describes the Solana chain', () => {
        expect(SOLANA_CAPABILITIES.chainLabel).toBe('Solana');
        expect(SOLANA_CAPABILITIES.renameMinLevel).toBe(1);
        expect(SOLANA_CAPABILITIES.levelUpFee).toBeNull();
        expect(SOLANA_CAPABILITIES.randomness.provider).toBe('switchboard');
    });

    it('base explorerTxUrl returns null (cluster resolved at runtime)', () => {
        expect(SOLANA_CAPABILITIES.explorerTxUrl('abc')).toBeNull();
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
        expect(result.current.capabilities.chainLabel).toBe('Solana');
    });

    it('explorerTxUrl includes devnet cluster from rpcEndpoint', () => {
        const { result } = renderHook(() => useSolanaAdapter({ enabled: true }));
        const url = result.current.capabilities.explorerTxUrl('mysig123');
        expect(url).toContain('explorer.solana.com/tx/mysig123');
        expect(url).toContain('cluster=devnet');
    });

    it('is disconnected without a signing wallet', () => {
        anchor.signingWallet = null;
        const { result } = renderHook(() => useSolanaAdapter({ enabled: true }));
        expect(result.current.isConnected).toBe(false);
        expect(result.current.address).toBeNull();
    });

    it('maps mutations to pet actions with numeric ids and asset keys', async () => {
        const { result } = renderHook(() => useSolanaAdapter({ enabled: true }));

        await result.current.createPet.mutateAsync({ name: 'S' });
        expect(actions.mintPet.mutateAsync).toHaveBeenCalledWith({ name: 'S' });

        await result.current.levelUpPet.mutateAsync({ petId: '5' });
        expect(actions.levelUpPet.mutateAsync).toHaveBeenCalledWith({ petId: 5, assetKey: ASSET_5 });

        await result.current.trainPet.mutateAsync({ petId: '5' });
        expect(actions.trainPet.mutateAsync).toHaveBeenCalledWith({ petId: 5, assetKey: ASSET_5 });

        await result.current.renamePet.mutateAsync({ petId: '5', name: 'NewName' });
        expect(actions.renamePet.mutateAsync).toHaveBeenCalledWith({ petId: 5, name: 'NewName', assetKey: ASSET_5 });

        await result.current.breedPets.mutateAsync({ parentId1: '1', parentId2: '2', name: 'Baby' });
        expect(actions.breedPets.mutateAsync).toHaveBeenCalledWith({
            parent1Id: 1,
            parent2Id: 2,
            name: 'Baby',
            parent1AssetKey: ASSET_1,
            parent2AssetKey: ASSET_2,
            parent2Owner: undefined,
        });
    });

    it('cross-owner breed: errors when program not ready (null programId)', async () => {
        // With programId=null the adapter can't look up the spouse on-chain.
        // crossOwner=true should throw rather than silently send the wrong owner.
        const { result } = renderHook(() => useSolanaAdapter({ enabled: true }));
        await expect(
            result.current.breedPets.mutateAsync({ parentId1: '1', parentId2: '99', name: 'Baby', crossOwner: true }),
        ).rejects.toThrow(/not found on-chain|program.*not ready|programId/i);
    });

    it('derives the lifecycle phase from the action mutation state', () => {
        actions.mintPet.isPending = true;
        let hook = renderHook(() => useSolanaAdapter({ enabled: true }));
        expect(hook.result.current.createPet.lifecycle.phase).toBe('awaiting-wallet');

        actions.mintPet.isPending = false;
        actions.mintPet.isSuccess = true;
        actions.mintPet.data = 'sig123';
        hook = renderHook(() => useSolanaAdapter({ enabled: true }));
        expect(hook.result.current.createPet.lifecycle.phase).toBe('success');
        expect(hook.result.current.createPet.lifecycle.hash).toBe('sig123');

        actions.mintPet.isSuccess = false;
        actions.mintPet.isError = true;
        hook = renderHook(() => useSolanaAdapter({ enabled: true }));
        expect(hook.result.current.createPet.lifecycle.phase).toBe('error');
    });

    it('transferPet forwards the pet asset key and recipient', async () => {
        const { result } = renderHook(() => useSolanaAdapter({ enabled: true }));
        await result.current.transferPet.mutateAsync({ petId: '1', to: validAddress });
        expect(actions.transferPet.mutateAsync).toHaveBeenCalledWith({ assetKey: ASSET_1, to: validAddress });
    });
});
