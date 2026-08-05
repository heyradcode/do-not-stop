import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApiClient } from '../../contexts/ApiClientContext';
import { useAuth } from '../../contexts/AuthContext';
import type { OpponentPet, PetChain } from '../../types/pet';

const OPPONENTS_QUERY = `
    query Opponents($chain: String!, $minLevel: Int, $page: Int, $pageSize: Int) {
        opponents(chain: $chain, minLevel: $minLevel, page: $page, pageSize: $pageSize) {
            opponents {
                id chain owner name dna
                level rarity winCount lossCount readyAt
            }
            total page pageSize
        }
    }
`;

interface OpponentDto {
    id: string;
    chain: PetChain;
    owner: string;
    name: string;
    dna: string;
    level: number;
    rarity: number;
    winCount: number;
    lossCount: number;
    readyAt: number;
}

interface OpponentsPage {
    opponents: OpponentDto[];
    total: number;
    page: number;
    pageSize: number;
}

interface GraphQLResponse {
    data?: { opponents: OpponentsPage };
    errors?: { message: string }[];
}

export interface UseOpponentsOptions {
    /** Active chain; the query is disabled until this is set. */
    chain: PetChain | null;
    /** Only return pets at or above this level. */
    minLevel?: number;
    /** Zero-based page index. */
    page?: number;
    /** Override the default enabled state. */
    enabled?: boolean;
}

export interface UseOpponentsResult {
    opponents: OpponentPet[];
    total: number;
    isLoading: boolean;
    error: Error | null;
    refetch: () => void;
}

/**
 * Fetches battle-ready pets owned by OTHER players for PvP matchmaking via the
 * backend's `/graphql` endpoint. Requires {@link ApiClientProvider} and an
 * authenticated session (the JWT address is used server-side to exclude the
 * caller's own pets).
 */
export const useOpponents = ({ chain, minLevel, page = 0, enabled = true }: UseOpponentsOptions): UseOpponentsResult => {
    const apiClient = useApiClient();
    const { isAuthenticated } = useAuth();
    const baseURL = apiClient.defaults.baseURL ?? '';

    const query = useQuery({
        queryKey: ['opponents', baseURL, chain, minLevel ?? null, page],
        enabled: enabled && chain != null && isAuthenticated,
        queryFn: async () => {
            const { data } = await apiClient.post<GraphQLResponse>('/graphql', {
                query: OPPONENTS_QUERY,
                variables: { chain, minLevel: minLevel ?? null, page },
            });

            if (data.errors?.length) {
                throw new Error(data.errors.map((e) => e.message).join('; '));
            }

            return data.data?.opponents ?? { opponents: [], total: 0, page, pageSize: 20 };
        },
    });

    const opponents = useMemo<OpponentPet[]>(
        () =>
            query.data?.opponents?.map((o) => ({
                id: o.id,
                chain: o.chain,
                owner: o.owner,
                name: o.name,
                dna: BigInt(o.dna),
                level: o.level,
                rarity: o.rarity,
                winCount: o.winCount,
                lossCount: o.lossCount,
                readyAt: o.readyAt,
            })) ?? [],
        [query.data],
    );

    return {
        opponents,
        total: query.data?.total ?? 0,
        isLoading: query.isLoading,
        error: query.error as Error | null,
        refetch: query.refetch,
    };
};
