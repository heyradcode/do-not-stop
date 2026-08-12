import { useQuery } from '@tanstack/react-query';

import { useApiClient } from '../../contexts/ApiClientContext';

/**
 * Every published season, newest first (`GET /api/rewards/seasons`).
 *
 * The discovery read. Without it a season is reachable only by someone who was told its
 * number out of band, since `useRewardSeason` needs an id the caller already has.
 *
 * Deliberately thin: it carries what a list renders and nothing that belongs to the
 * single-season read. The root and the sequence range live there, where the reproducibility
 * contract is, and two copies would give a client two answers to check against.
 */

export interface RewardSeasonSummary {
    seasonId: number;
    /** Protocol chain id, e.g. `eip155:84532` or `solana:devnet`. */
    chainId: string;
    deploymentId: string;
    /** ERC-20 address or SPL mint. */
    token: string;
    /** Sum of every entitlement, in the token's smallest unit. */
    totalAmount: string;
    /** Null until the root is posted on chain: the season exists but cannot be claimed yet. */
    openedAt: string | null;
}

export const REWARD_SEASONS_QUERY_KEY = ['rewards', 'seasons'] as const;

export function useRewardSeasons() {
    const apiClient = useApiClient();

    return useQuery({
        queryKey: REWARD_SEASONS_QUERY_KEY,
        queryFn: async (): Promise<RewardSeasonSummary[]> => {
            const { data } = await apiClient.get<{ seasons: RewardSeasonSummary[] }>('/api/rewards/seasons');
            return data.seasons;
        },
    });
}
