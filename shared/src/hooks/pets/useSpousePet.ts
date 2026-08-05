import { useQuery } from '@tanstack/react-query';
import { useApiClient } from '../../contexts/ApiClientContext';
import type { PetChain } from '../../types/pet';

const SPOUSE_PET_QUERY = `
    query SpousePet($chain: String!, $id: String!) {
        pet(chain: $chain, id: $id) { id name level }
    }
`;

interface SpousePetDto {
    id: string;
    name: string;
    level: number;
}

interface GraphQLResponse {
    data?: { pet: SpousePetDto | null };
    errors?: { message: string }[];
}

export interface UseSpousePetOptions {
    /** Skip the query — e.g. the pet is already resolved from a bulk roster fetch. */
    skip?: boolean;
}

export interface SpousePetResult {
    name?: string;
    level?: number;
}

/**
 * Direct pet-by-id lookup (no debounce) — fires immediately on mount to resolve a
 * spouse's name/level when the bulk roster doesn't already have it. Shares the
 * `['pet', baseURL, chain, id]` query key so multiple callers dedupe the request.
 */
export const useSpousePet = (
    chain: PetChain | null,
    id: string,
    { skip = false }: UseSpousePetOptions = {},
): SpousePetResult => {
    const apiClient = useApiClient();
    const baseURL = apiClient.defaults.baseURL ?? '';
    const { data } = useQuery({
        queryKey: ['pet', baseURL, chain, id],
        enabled: !skip && Boolean(chain && id && id !== '0'),
        queryFn: async () => {
            const res = await apiClient.post<GraphQLResponse>('/graphql', {
                query: SPOUSE_PET_QUERY,
                variables: { chain, id },
            });
            if (res.data.errors?.length) {
                throw new Error(res.data.errors.map((e) => e.message).join('; '));
            }
            return res.data.data?.pet ?? null;
        },
        staleTime: 60_000,
    });
    return { name: data?.name, level: data?.level };
};
