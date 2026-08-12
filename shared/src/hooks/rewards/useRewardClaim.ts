import { useQuery } from '@tanstack/react-query';

import { useApiClient } from '../../contexts/ApiClientContext';

/**
 * One wallet's claim proof for one season
 * (`GET /api/rewards/seasons/:seasonId/claim/:wallet`).
 *
 * **A 404 is an answer, not a failure.** The backend returns `no-entitlement` both for an
 * unknown season and for a wallet that earned nothing, deliberately: distinguishing them
 * would leak which wallets participated to anyone enumerating. So this resolves to `null`
 * rather than throwing, and a UI renders "nothing to claim" instead of an error. Every other
 * status is a real failure and propagates.
 *
 * Unauthenticated, like the season metadata. A proof only ever pays the wallet bound inside
 * its leaf, so publishing one lets a stranger sponsor someone's gas, not take their reward.
 */

export interface RewardClaim {
    seasonId: number;
    /** Normalized as the protocol normalizes accounts: lowercased on EVM, base58 as-is. */
    wallet: string;
    /** Amount in the token's smallest unit, as a decimal string. */
    amount: string;
    merkleRoot: string;
    proof: string[];
    /** How the number was arrived at — battles counted, wins, losses, caps applied. */
    breakdown: unknown;
}

export const rewardClaimQueryKey = (seasonId: number | null, wallet: string | null) =>
    ['rewards', 'claim', seasonId, wallet] as const;

/** `null` means "no entitlement", which is a legitimate outcome rather than an error. */
export function useRewardClaim(seasonId: number | null, wallet: string | null) {
    const apiClient = useApiClient();

    return useQuery({
        queryKey: rewardClaimQueryKey(seasonId, wallet),
        enabled: seasonId !== null && Boolean(wallet),
        queryFn: async (): Promise<RewardClaim | null> => {
            try {
                const { data } = await apiClient.get<RewardClaim>(
                    `/api/rewards/seasons/${seasonId}/claim/${wallet}`,
                );
                return data;
            } catch (error) {
                if (isNotFound(error)) {
                    return null;
                }
                throw error;
            }
        },
        staleTime: Infinity,
    });
}

/**
 * Narrowed to a 404 specifically.
 *
 * Not a bare catch: a 500, a network failure, or an auth problem must not read as "you have
 * no reward". That would tell a player they earned nothing when the truth is that we could
 * not find out, and it is the kind of wrong answer nobody reports as a bug.
 */
function isNotFound(error: unknown): boolean {
    return (
        typeof error === 'object' &&
        error !== null &&
        (error as { response?: { status?: number } }).response?.status === 404
    );
}
