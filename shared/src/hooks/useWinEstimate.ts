import { useQuery } from '@tanstack/react-query';
import { useApiClient } from '../contexts/ApiClientContext';
import type { PetChain } from '../types/pet';

const WIN_ESTIMATE_QUERY = `
    query WinEstimate($chain: String!, $petId1: String!, $petId2: String!) {
        winEstimate(chain: $chain, petId1: $petId1, petId2: $petId2) {
            winProbability
            samples
        }
    }
`;

interface WinEstimateDto {
    winProbability: number;
    samples: number;
}

interface GraphQLResponse {
    data?: { winEstimate: WinEstimateDto | null };
    errors?: { message: string }[];
}

export interface WinEstimateResult {
    /** Fighter's win probability in [0, 1], or null when unavailable. */
    winProbability: number | null;
    samples: number | null;
    isLoading: boolean;
}

/**
 * Fetches a pre-fight win probability estimate from indexer-go's combat sim.
 * Returns null when the indexer link is off or the roster cache is cold —
 * the UI degrades gracefully to "odds unavailable".
 */
export const useWinEstimate = (
    chain: PetChain | null,
    petId1: string | null | undefined,
    petId2: string | null | undefined,
): WinEstimateResult => {
    const apiClient = useApiClient();
    const baseURL = apiClient.defaults.baseURL ?? '';
    const enabled = chain != null && Boolean(petId1) && Boolean(petId2);

    const query = useQuery({
        queryKey: ['winEstimate', baseURL, chain, petId1 ?? '', petId2 ?? ''],
        enabled,
        queryFn: async () => {
            const { data } = await apiClient.post<GraphQLResponse>('/graphql', {
                query: WIN_ESTIMATE_QUERY,
                variables: { chain, petId1, petId2 },
            });
            if (data.errors?.length) {
                throw new Error(data.errors.map((e) => e.message).join('; '));
            }
            return data.data?.winEstimate ?? null;
        },
        staleTime: 30_000,
        retry: false,
    });

    return {
        winProbability: query.data?.winProbability ?? null,
        samples: query.data?.samples ?? null,
        isLoading: query.isFetching,
    };
};
