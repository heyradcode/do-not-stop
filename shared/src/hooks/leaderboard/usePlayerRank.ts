import { useQuery } from '@tanstack/react-query';
import { useApiClient } from '../../contexts/ApiClientContext';
import { useAuth } from '../../contexts/AuthContext';
import type { PetChain } from '../../types/pet';
import type { PlayerLeaderboardEntry } from './usePlayerLeaderboard';

const PLAYER_RANK_QUERY = `
    query PlayerRank($chain: String!) {
        playerRank(chain: $chain) { rank owner winCount lossCount petCount }
    }
`;

interface GraphQLResponse {
    data?: { playerRank: PlayerLeaderboardEntry | null };
    errors?: { message: string }[];
}

export interface UsePlayerRankResult {
    /** Null while loading, and for a player with no pet that has fought. */
    rank: PlayerLeaderboardEntry | null;
    isLoading: boolean;
}

/**
 * The connected wallet's own standing on the player board.
 *
 * Separate from {@link usePlayerLeaderboard} because finding yourself in a paged board
 * costs one request per page and gets worse as the game grows; the backend answers this
 * with one ranked query.
 *
 * Whose rank it is comes from the session, not from an argument — there is deliberately
 * no way to ask for someone else's. A null result means unranked, which is a real state
 * and not an error: it is what a player who has never fought should be told.
 */
export const usePlayerRank = (chain: PetChain | null): UsePlayerRankResult => {
    const apiClient = useApiClient();
    const { isAuthenticated } = useAuth();
    const baseURL = apiClient.defaults.baseURL ?? '';

    const query = useQuery({
        queryKey: ['playerRank', baseURL, chain],
        enabled: chain != null && isAuthenticated,
        queryFn: async () => {
            const { data } = await apiClient.post<GraphQLResponse>('/graphql', {
                query: PLAYER_RANK_QUERY,
                variables: { chain },
            });

            if (data.errors?.length) {
                throw new Error(data.errors.map((e) => e.message).join('; '));
            }

            return data.data?.playerRank ?? null;
        },
    });

    return { rank: query.data ?? null, isLoading: query.isLoading };
};
