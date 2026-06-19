import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApiClient } from '../contexts/ApiClientContext';
import type { OpponentPet, PetChain } from '../types/pet';

const SEARCH_QUERY = `
    query SearchPets($chain: String!, $query: String!, $limit: Int) {
        searchPets(chain: $chain, query: $query, limit: $limit) {
            id chain owner name dna
            level rarity winCount lossCount readyAt
            xp generation spouseId
        }
    }
`;

interface SearchPetDto {
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
    xp: number;
    generation: number;
    spouseId: string;
}

interface GraphQLResponse {
    data?: { searchPets: SearchPetDto[] };
    errors?: { message: string }[];
}

export interface UseSearchPetsOptions {
    chain: PetChain | null;
    /** Minimum query length before firing; default 1. */
    minLength?: number;
    /** Max results to request from the server; default 10. */
    limit?: number;
    enabled?: boolean;
}

export interface SearchPetsResult {
    results: OpponentPet[];
    isLoading: boolean;
    error: Error | null;
}

/**
 * Search pets across the roster by name prefix or exact numeric ID.
 * Debounced 300 ms to avoid a request per keystroke.
 */
export const useSearchPets = (
    query: string,
    { chain, minLength = 1, limit = 10, enabled = true }: UseSearchPetsOptions,
): SearchPetsResult => {
    const apiClient = useApiClient();
    const baseURL = apiClient.defaults.baseURL ?? '';

    // 300 ms debounce — avoids a round-trip on every keystroke.
    const [debouncedQuery, setDebouncedQuery] = useState(query);
    useEffect(() => {
        const id = setTimeout(() => setDebouncedQuery(query), 300);
        return () => clearTimeout(id);
    }, [query]);

    const trimmed = debouncedQuery.trim();
    const shouldFetch = enabled && chain != null && trimmed.length >= minLength;

    const q = useQuery({
        queryKey: ['searchPets', baseURL, chain, trimmed, limit],
        enabled: shouldFetch,
        queryFn: async () => {
            const { data } = await apiClient.post<GraphQLResponse>('/graphql', {
                query: SEARCH_QUERY,
                variables: { chain, query: trimmed, limit },
            });

            if (data.errors?.length) {
                throw new Error(data.errors.map((e) => e.message).join('; '));
            }

            return data.data?.searchPets ?? [];
        },
        // Keep previous results visible while the next query is in-flight so
        // the dropdown doesn't flash empty between keystrokes.
        placeholderData: (prev) => prev,
        staleTime: 10_000,
    });

    const results = useMemo<OpponentPet[]>(
        () =>
            (q.data ?? []).map((p) => ({
                id: p.id,
                chain: p.chain,
                owner: p.owner,
                name: p.name,
                dna: BigInt(p.dna),
                level: p.level,
                rarity: p.rarity,
                winCount: p.winCount,
                lossCount: p.lossCount,
                readyAt: p.readyAt,
                xp: p.xp,
                generation: p.generation,
                spouseId: Number(p.spouseId) || undefined,
            })),
        [q.data],
    );

    return {
        results,
        isLoading: q.isFetching,
        error: q.error as Error | null,
    };
};
