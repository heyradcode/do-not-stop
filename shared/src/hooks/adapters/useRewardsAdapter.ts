import { useState } from 'react';
import { useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { PublicKey } from '@solana/web3.js';

import { useProgram } from '../chains/solana/useProgram';
import { useSolanaAnchor } from '../../contexts/SolanaAnchorContext';
import { claimRewardOnSolana } from '../../utils/solana/claimReward';
import { useActiveChain } from '../session/useActiveChain';
import { SEASON_REWARD_DISTRIBUTOR_ABI } from './rewardsAbi';
import type { AdapterMutation, TxLifecycle, TxPhase } from './types';
import type { ClaimRewardArgs, RewardsAdapter } from './rewardsTypes';

/**
 * The active chain's rewards adapter (§I).
 *
 * Same shape as `useInventoryAdapter`: both branches are evaluated every render (rules of
 * hooks) and the inactive one is simply not returned. Same lifecycle asymmetry too — EVM is
 * a wagmi write with a hash and a receipt to wait on, so it has real intermediate states,
 * while a Solana `.rpc()` resolves once confirmed and reports pending then done.
 *
 * The distributor comes from the season, not from deployment config, and the interface says
 * why: a proof is bound to one distributor, so aiming it at another fails after the wallet
 * prompt rather than before it.
 */

type WriteState = {
    writeContractAsync: (args: never) => Promise<`0x${string}`>;
    data?: `0x${string}`;
    isPending: boolean;
    error: unknown;
    reset: () => void;
};
type ReceiptState = { isSuccess: boolean; isError: boolean; error: unknown };

const toLifecycle = (w: WriteState, r: ReceiptState): TxLifecycle => {
    const writeError = w.error as Error | null;
    const receiptError = r.isError ? (r.error as Error | null) : null;
    const error = writeError ?? receiptError;
    let phase: TxPhase = 'idle';
    if (error) phase = 'error';
    else if (r.isSuccess) phase = 'success';
    else if (w.data) phase = 'confirming';
    else if (w.isPending) phase = 'awaiting-wallet';
    return { phase, hash: w.data, error, reset: w.reset };
};

const IDLE_LIFECYCLE: TxLifecycle = { phase: 'idle', error: null, reset: () => {} };

const disabledAdapter = (kind: RewardsAdapter['kind'], reason: string): RewardsAdapter => ({
    kind,
    canClaim: false,
    claim: {
        mutateAsync: () => Promise.reject(new Error(reason)),
        lifecycle: IDLE_LIFECYCLE,
        isPending: false,
    },
});

export const useRewardsAdapter = (): RewardsAdapter => {
    const chain = useActiveChain();

    // `program` only: `useProgram` also resolves the *pets* program id, and rewards is a
    // different program whose address comes from the season's `distributor`.
    const { program } = useProgram();
    const { signingWallet } = useSolanaAnchor();
    const solanaPayer = signingWallet?.publicKey ?? null;

    const claimW = useWriteContract();
    const claimR = useWaitForTransactionReceipt({ hash: claimW.data, query: { enabled: !!claimW.data } });

    const evmClaim: AdapterMutation<ClaimRewardArgs> = {
        async mutateAsync({ seasonId, wallet, amount, proof, distributor, evmChainId }) {
            await claimW.writeContractAsync({
                address: distributor,
                abi: SEASON_REWARD_DISTRIBUTOR_ABI,
                functionName: 'claim',
                // `amount` is uint256 on chain and a decimal string here, because a season
                // payout can exceed what a JS number holds. `seasonId` is uint32 and cannot.
                args: [seasonId, wallet, BigInt(amount), proof],
                chainId: evmChainId ?? undefined,
            } as unknown as Parameters<typeof claimW.writeContractAsync>[0]);
        },
        lifecycle: toLifecycle(claimW as WriteState, claimR),
        isPending: claimW.isPending || (!!claimW.data && !claimR.isSuccess && !claimR.isError),
    };

    const [solanaPhase, setSolanaPhase] = useState<TxPhase>('idle');
    const [solanaError, setSolanaError] = useState<Error | null>(null);
    const solanaCanClaim = chain.kind === 'solana' && Boolean(program && solanaPayer);

    const solanaLifecycle: TxLifecycle = {
        phase: solanaPhase,
        error: solanaError,
        reset: () => {
            setSolanaPhase('idle');
            setSolanaError(null);
        },
    };

    const solanaClaim: AdapterMutation<ClaimRewardArgs> = {
        async mutateAsync({ seasonId, wallet, amount, proof, distributor, token }) {
            if (!program || !solanaPayer) {
                throw new Error('Solana wallet is not connected');
            }
            setSolanaPhase('awaiting-wallet');
            setSolanaError(null);
            try {
                await claimRewardOnSolana({
                    program,
                    // The season's distributor, not `useProgram`'s id: that hook resolves the
                    // pets program, and rewards is a different one.
                    programId: new PublicKey(distributor),
                    payer: solanaPayer,
                    wallet: new PublicKey(wallet),
                    mint: new PublicKey(token),
                    seasonId,
                    amount,
                    proof,
                });
                setSolanaPhase('success');
            } catch (error) {
                setSolanaError(error as Error);
                setSolanaPhase('error');
                throw error;
            }
        },
        lifecycle: solanaLifecycle,
        isPending: solanaPhase === 'awaiting-wallet',
    };

    if (chain.kind === 'solana') {
        return solanaCanClaim
            ? { kind: 'solana', canClaim: true, claim: solanaClaim }
            : disabledAdapter('solana', 'Connect a Solana wallet to claim');
    }
    if (chain.kind === 'evm') {
        return { kind: 'evm', canClaim: true, claim: evmClaim };
    }
    return disabledAdapter('none', 'Connect a wallet to claim');
};
