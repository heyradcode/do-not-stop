import { useQuery } from '@tanstack/react-query';
import { useApiClient } from '../../contexts/ApiClientContext';
import { useAuth } from '../../contexts/AuthContext';
import type { PetChain } from '../../types/pet';

const LEADERBOARD_QUERY = `
    query Leaderboard($chain: String!, $page: Int, $pageSize: Int, $search: String) {
        leaderboard(chain: $chain, page: $page, pageSize: $pageSize, search: $search) {
            entries {
                rank id chain owner name dna
                level rarity winCount lossCount asset
            }
            total page pageSize
        }
    }
`;

/** One ranked pet, as the backend ranks it. */
export interface LeaderboardEntry {
    /** 1-based position in the full ranking, not within the page. */
    rank: number;
    id: string;
    chain: PetChain;
    owner: string;
    name: string;
    dna: string;
    level: number;
    rarity: number;
    winCount: number;
    lossCount: number;
    /** Metaplex Core asset pubkey (Solana only); "" on EVM. Feeds `petArtUrl`. */
    asset: string;
}

interface LeaderboardPage {
    entries: LeaderboardEntry[];
    total: number;
    page: number;
    pageSize: number;
}

interface GraphQLResponse {
    data?: { leaderboard: LeaderboardPage };
    errors?: { message: string }[];
}

export interface UseLeaderboardOptions {
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

export interface UseLeaderboardResult {
    entries: LeaderboardEntry[];
    total: number;
    pageSize: number;
    isLoading: boolean;
    error: Error | null;
}

/**
 * Pets ranked by battle record, from the backend's `/graphql` endpoint.
 *
 * The ranking is the backend's, deliberately: it ranks on the merged record
 * (`pet_battle_progress` over the frozen `pet_roster` counters) in the query that orders
 * the rows, so a client-side re-sort of one page would only reorder rows the server
 * already chose. Ranks are absolute, so `entry.rank` is correct on every page.
 *
 * Requires an authenticated session — `/graphql` sits behind the JWT middleware.
 */
export const useLeaderboard = ({
    chain,
    page = 0,
    search,
    enabled = true,
}: UseLeaderboardOptions): UseLeaderboardResult => {
    const apiClient = useApiClient();
    const { isAuthenticated } = useAuth();
    const baseURL = apiClient.defaults.baseURL ?? '';

    const query = useQuery({
        queryKey: ['leaderboard', baseURL, chain, page, search ?? ''],
        enabled: enabled && chain != null && isAuthenticated,
        queryFn: async () => {
            const { data } = await apiClient.post<GraphQLResponse>('/graphql', {
                query: LEADERBOARD_QUERY,
                variables: { chain, page, search },
            });

            if (data.errors?.length) {
                throw new Error(data.errors.map((e) => e.message).join('; '));
            }

            return data.data?.leaderboard ?? { entries: [], total: 0, page, pageSize: 20 };
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
