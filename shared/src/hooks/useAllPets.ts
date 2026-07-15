import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApiClient } from '../contexts/ApiClientContext';
import type { OpponentPet, PetChain } from '../types/pet';

const ALL_PETS_QUERY = `
    query AllPets($chain: String!, $limit: Int) {
        allPets(chain: $chain, limit: $limit) {
            id chain owner name dna
            level rarity winCount lossCount readyAt
            xp generation spouseId
        }
    }
`;

interface PetDto {
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
    data?: { allPets: PetDto[] };
    errors?: { message: string }[];
}

export interface UseAllPetsOptions {
    limit?: number;
    enabled?: boolean;
}

export interface UseAllPetsResult {
    pets: OpponentPet[];
    isLoading: boolean;
    error: Error | null;
    refetch: () => void;
}

/**
 * Fetch every pet on a given chain from the backend roster.
 * Used by the incoming-proposals flow to enumerate candidate proposers.
 */
export const useAllPets = (
    chain: PetChain | null,
    { limit = 200, enabled = true }: UseAllPetsOptions = {},
): UseAllPetsResult => {
    const apiClient = useApiClient();
    const baseURL = apiClient.defaults.baseURL ?? '';

    const query = useQuery({
        queryKey: ['allPets', baseURL, chain, limit],
        enabled: enabled && chain != null,
        queryFn: async () => {
            const { data } = await apiClient.post<GraphQLResponse>('/graphql', {
                query: ALL_PETS_QUERY,
                variables: { chain, limit },
            });
            if (data.errors?.length) {
                throw new Error(data.errors.map((e) => e.message).join('; '));
            }
            return data.data?.allPets ?? [];
        },
        staleTime: 30_000,
    });

    const pets = useMemo<OpponentPet[]>(
        () =>
            (query.data ?? []).map((p) => ({
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
        [query.data],
    );

    return {
        pets,
        isLoading: query.isLoading,
        error: query.error as Error | null,
        refetch: query.refetch,
    };
};
