import { useQuery } from '@tanstack/react-query';
import { useReadContract } from 'wagmi';
import { PublicKey } from '@solana/web3.js';

import { useSolanaAnchor } from '../../contexts/SolanaAnchorContext';
import { SEASON_REWARD_DISTRIBUTOR_ABI } from '../adapters/rewardsAbi';
import { claimedPda } from '../../utils/solana/pdas';
import { useActiveChain } from '../session/useActiveChain';
import type { RewardSeason } from './useRewardSeason';

/**
 * Whether a wallet has already claimed a season, read from the chain.
 *
 * The backend cannot answer this. It serves the proof from the season it built and has no
 * view of what has been spent on chain, so without this read a claimed wallet sees the
 * button again on every reload — clicking it fails at the distributor, which is safe but
 * reads as a broken button rather than a completed claim.
 *
 * Branches internally rather than going through the adapter, mirroring `useFees`: the
 * adapter is about writes, and both chains' hooks have to run every render anyway.
 *
 * `undefined` while unknown, so a caller can tell "not yet read" from "not claimed" and
 * avoid flashing a claim button that is about to disappear.
 */

export function useRewardClaimed(season: RewardSeason | undefined, wallet: string | null) {
    const chain = useActiveChain();
    const { connection } = useSolanaAnchor();

    const isEvm = chain.kind === 'evm';
    const isSolana = chain.kind === 'solana';
    const ready = Boolean(season && wallet);

    const evm = useReadContract({
        address: season?.distributor as `0x${string}` | undefined,
        abi: SEASON_REWARD_DISTRIBUTOR_ABI,
        functionName: 'hasClaimed',
        args: season && wallet ? [season.seasonId, wallet as `0x${string}`] : undefined,
        chainId: season?.evmChainId ?? undefined,
        query: { enabled: isEvm && ready },
    });

    const solana = useQuery({
        queryKey: ['rewards', 'claimed', 'solana', season?.seasonId ?? null, wallet],
        enabled: isSolana && ready,
        queryFn: async (): Promise<boolean> => {
            // Existence *is* the record: `claim` creates this PDA with `init`, which is what
            // makes a second claim impossible. Nothing ever closes it.
            const [pda] = claimedPda(
                new PublicKey(season!.distributor),
                season!.seasonId,
                new PublicKey(wallet!),
            );
            return (await connection.getAccountInfo(pda)) !== null;
        },
    });

    if (isSolana) {
        return { claimed: solana.data, isLoading: solana.isLoading, refetch: solana.refetch };
    }
    if (isEvm) {
        return { claimed: evm.data as boolean | undefined, isLoading: evm.isLoading, refetch: evm.refetch };
    }
    return { claimed: undefined, isLoading: false, refetch: () => {} };
}
