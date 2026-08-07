import { useQuery } from '@tanstack/react-query';
import { useApiClient } from '../../contexts/ApiClientContext';
import { useAuth } from '../../contexts/AuthContext';
import type { PetChain } from '../../types/pet';

const PLAYER_LEADERBOARD_QUERY = `
    query PlayerLeaderboard($chain: String!, $page: Int, $pageSize: Int, $search: String) {
        playerLeaderboard(chain: $chain, page: $page, pageSize: $pageSize, search: $search) {
            entries { rank owner winCount lossCount petCount }
            total page pageSize
        }
    }
`;

/** One ranked owner: their pets' battle records, summed. */
export interface PlayerLeaderboardEntry {
    /** 1-based position in the full ranking, not within the page. */
    rank: number;
    /** EVM addresses arrive lowercased; Solana pubkeys keep their case. */
    owner: string;
    winCount: number;
    lossCount: number;
    /** How many of this owner's pets have a battle record. */
    petCount: number;
}

interface PlayerLeaderboardPage {
    entries: PlayerLeaderboardEntry[];
    total: number;
    page: number;
    pageSize: number;
}

interface GraphQLResponse {
    data?: { playerLeaderboard: PlayerLeaderboardPage };
    errors?: { message: string }[];
}

export interface UsePlayerLeaderboardOptions {
    /** Active chain; the query is disabled until this is set. */
    chain: PetChain | null;
    /** Zero-based page index. */
    page?: number;
    /**
     * Narrows the board to matching rows. Ranks are unaffected: a match keeps its place
     * on the full board, so searching answers "where does this sit" rather than
     * renumbering the results from one.
     */
    search?: string;
    enabled?: boolean;
}

export interface UsePlayerLeaderboardResult {
    entries: PlayerLeaderboardEntry[];
    total: number;
    pageSize: number;
    isLoading: boolean;
    error: Error | null;
}

/**
 * Owners ranked by their pets' combined battle record.
 *
 * Same server-side ranking as {@link useLeaderboard}, aggregated per owner. The owner
 * string is the grouping key the backend used, so comparing it to a connected wallet
 * needs the same case folding the backend applies (lowercase on EVM, untouched on
 * Solana) rather than a raw equality check.
 */
export const usePlayerLeaderboard = ({
    chain,
    page = 0,
    search,
    enabled = true,
}: UsePlayerLeaderboardOptions): UsePlayerLeaderboardResult => {
    const apiClient = useApiClient();
    const { isAuthenticated } = useAuth();
    const baseURL = apiClient.defaults.baseURL ?? '';

    const query = useQuery({
        queryKey: ['playerLeaderboard', baseURL, chain, page, search ?? ''],
        enabled: enabled && chain != null && isAuthenticated,
        queryFn: async () => {
            const { data } = await apiClient.post<GraphQLResponse>('/graphql', {
                query: PLAYER_LEADERBOARD_QUERY,
                variables: { chain, page, search },
            });

            if (data.errors?.length) {
                throw new Error(data.errors.map((e) => e.message).join('; '));
            }

            return data.data?.playerLeaderboard ?? { entries: [], total: 0, page, pageSize: 20 };
        },
    });

    return {
        entries: query.data?.entries ?? [],
        total: query.data?.total ?? 0,
        pageSize: query.data?.pageSize ?? 20,
        isLoading: query.isLoading,
        error: query.error as Error | null,
    };
};
