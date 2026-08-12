import { useQuery } from '@tanstack/react-query';

import { useApiClient } from '../../contexts/ApiClientContext';

/**
 * A published reward season (`GET /api/rewards/seasons/:seasonId`).
 *
 * Unauthenticated, like the receipt corpus: the numbers here are what make a season's
 * arithmetic checkable by anyone, and requiring a login would only stop people checking it.
 *
 * Exactly one of `evmChainId` and `chainRef` is set, decided by the season's chain. Both are
 * part of what a leaf binds, so a client rebuilding the tree to verify the root needs
 * whichever one this season carries — that is why the endpoint serves both columns rather
 * than the EVM one alone.
 */

export interface RewardSeason {
    seasonId: number;
    /** Protocol chain id, e.g. `eip155:84532` or `solana:devnet`. */
    chainId: string;
    deploymentId: string;
    /** Inclusive receipt sequence range, as decimal strings: these are bigints on the wire. */
    firstSequence: string;
    lastSequence: string;
    /** Contract address on EVM, program id on Solana. */
    distributor: string;
    /** EVM seasons only. */
    evmChainId: number | null;
    /** Solana seasons only: the cluster's genesis hash. */
    chainRef: string | null;
    /** ERC-20 address or SPL mint. */
    token: string;
    merkleRoot: string;
    totalAmount: string;
    /** The rates the amounts were computed from, kept so the season is reproducible. */
    params: unknown;
    openedTxHash: string | null;
    openedAt: string | null;
}

export const rewardSeasonQueryKey = (seasonId: number | null) => ['rewards', 'season', seasonId] as const;

export function useRewardSeason(seasonId: number | null) {
    const apiClient = useApiClient();

    return useQuery({
        queryKey: rewardSeasonQueryKey(seasonId),
        enabled: seasonId !== null,
        queryFn: async (): Promise<RewardSeason> => {
            const { data } = await apiClient.get<RewardSeason>(`/api/rewards/seasons/${seasonId}`);
            return data;
        },
        // A season is frozen once opened: the root, the range, and the rates cannot change,
        // and re-fetching would only re-confirm that.
        staleTime: Infinity,
    });
}
