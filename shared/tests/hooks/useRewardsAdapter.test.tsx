// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
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

const solana = { program: null as unknown, programId: null as unknown, signingWallet: null as { publicKey: unknown } | null };
vi.mock('../../src/hooks/chains/solana/useProgram', () => ({
    useProgram: () => ({ program: solana.program, programId: solana.programId }),
}));
vi.mock('../../src/contexts/SolanaAnchorContext', () => ({
    useSolanaAnchor: () => ({ signingWallet: solana.signingWallet }),
}));

const claimOnSolana = vi.fn();
vi.mock('../../src/utils/solana/claimReward', () => ({
    claimRewardOnSolana: (...args: unknown[]) => claimOnSolana(...args),
}));

import { useRewardsAdapter } from '../../src/hooks/adapters/useRewardsAdapter';

const wrapper = ({ children }: { children: React.ReactNode }) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

const EVM_ARGS = {
    seasonId: 1,
    wallet: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    amount: '125',
    proof: [`0x${'22'.repeat(32)}`],
    distributor: '0x1111111111111111111111111111111111111111',
    token: '0x2222222222222222222222222222222222222222',
    evmChainId: 84532,
};

const SOL_ARGS = {
    seasonId: 2,
    wallet: 'HN7cABqLq46Es1jh92dQQpjP4LxRo7vLYCsRoQ8HWzEA',
    amount: '125',
    proof: [`0x${'22'.repeat(32)}`],
    distributor: 'RewaRDsFhqhVBHrHFHKcnbXPPHUvNSVKWnxNBXjHkVh',
    token: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
};

beforeEach(() => {
    vi.clearAllMocks();
    chain.kind = 'evm';
    writeState.data = undefined;
    writeState.isPending = false;
    solana.program = null;
    solana.programId = null;
    solana.signingWallet = null;
});

describe('evm claims', () => {
    it('sends claim with the amount widened to bigint and the season id left a number', async () => {
        const { result } = renderHook(() => useRewardsAdapter(), { wrapper });

        await result.current.claim.mutateAsync(EVM_ARGS);

        const call = writeContractAsync.mock.calls[0]![0] as { address: string; args: unknown[]; chainId: number };
        expect(call.args).toEqual([1, EVM_ARGS.wallet, 125n, EVM_ARGS.proof]);
        expect(call.chainId).toBe(84532);
    });

    // A proof is bound to one distributor: leaves built for staging are not in production's
    // tree. Reading the address from config instead would aim a valid proof at the wrong
    // contract and fail after the wallet prompt.
    it('sends to the distributor the season names, not a configured address', async () => {
        const { result } = renderHook(() => useRewardsAdapter(), { wrapper });

        await result.current.claim.mutateAsync({ ...EVM_ARGS, distributor: '0x9999999999999999999999999999999999999999' });

        const call = writeContractAsync.mock.calls[0]![0] as { address: string };
        expect(call.address).toBe('0x9999999999999999999999999999999999999999');
    });

    // The leaf binds the beneficiary, so a sponsor can pay the gas without being able to
    // redirect the payout. That only holds while the wallet stays an argument.
    it('pays the wallet from the args, not the connected signer', async () => {
        const { result } = renderHook(() => useRewardsAdapter(), { wrapper });

        await result.current.claim.mutateAsync({ ...EVM_ARGS, wallet: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' });

        const call = writeContractAsync.mock.calls[0]![0] as { args: unknown[] };
        expect(call.args[1]).toBe('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
    });

    it('reports success only once the receipt lands, not when the hash appears', () => {
        writeState.data = '0xhash';
        receiptState.isSuccess = false;
        const confirming = renderHook(() => useRewardsAdapter(), { wrapper });
        expect(confirming.result.current.claim.lifecycle.phase).toBe('confirming');

        receiptState.isSuccess = true;
        const done = renderHook(() => useRewardsAdapter(), { wrapper });
        expect(done.result.current.claim.lifecycle.phase).toBe('success');
        receiptState.isSuccess = false;
    });
});

describe('solana claims', () => {
    it('refuses with no wallet connected rather than offering a button that throws', async () => {
        chain.kind = 'solana';
        const { result } = renderHook(() => useRewardsAdapter(), { wrapper });

        expect(result.current.canClaim).toBe(false);
        await expect(result.current.claim.mutateAsync(SOL_ARGS)).rejects.toThrow(/Connect a Solana wallet/);
        expect(claimOnSolana).not.toHaveBeenCalled();
    });

    it('claims through the rewards program once a wallet is connected', async () => {
        chain.kind = 'solana';
        solana.program = {};
        solana.signingWallet = { publicKey: 'PayerPubkey' };
        claimOnSolana.mockResolvedValue('sig');

        const { result } = renderHook(() => useRewardsAdapter(), { wrapper });
        expect(result.current.canClaim).toBe(true);

        await result.current.claim.mutateAsync(SOL_ARGS);

        const call = claimOnSolana.mock.calls[0]![0] as Record<string, { toBase58?: () => string }>;
        // The season's distributor, not useProgram's id: that hook resolves the pets
        // program, and rewards is a different one.
        expect(call.programId!.toBase58!()).toBe(SOL_ARGS.distributor);
        expect(call.wallet!.toBase58!()).toBe(SOL_ARGS.wallet);
        expect(call.mint!.toBase58!()).toBe(SOL_ARGS.token);
        expect(writeContractAsync).not.toHaveBeenCalled();
    });

    it('surfaces a failed claim as an error phase and rethrows', async () => {
        chain.kind = 'solana';
        solana.program = {};
        solana.signingWallet = { publicKey: 'PayerPubkey' };
        claimOnSolana.mockRejectedValue(new Error('already claimed'));

        const { result } = renderHook(() => useRewardsAdapter(), { wrapper });

        await expect(result.current.claim.mutateAsync(SOL_ARGS)).rejects.toThrow('already claimed');
    });
});

describe('no wallet', () => {
    it('is disabled when no chain is active', async () => {
        chain.kind = 'none';
        const { result } = renderHook(() => useRewardsAdapter(), { wrapper });

        expect(result.current.kind).toBe('none');
        expect(result.current.canClaim).toBe(false);
        await expect(result.current.claim.mutateAsync(EVM_ARGS)).rejects.toThrow(/Connect a wallet/);
    });
});
