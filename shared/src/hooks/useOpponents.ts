import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApiClient } from '../contexts/ApiClientContext';
import type { OpponentPet, PetChain } from '../types/pet';

/** Wire shape returned by `GET /api/battle/opponents` (dna as string). */
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

interface OpponentsResponse {
    opponents: OpponentDto[];
    total: number;
    page: number;
    pageSize: number;
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

/**
 * Fetches battle-ready pets owned by OTHER players for PvP matchmaking.
 * Requires {@link ApiClientProvider} (and an authenticated session — the API
 * excludes the caller's own pets using the JWT address).
 */
export function useOpponents({ chain, minLevel, page = 0, enabled = true }: UseOpponentsOptions) {
    const apiClient = useApiClient();
    const baseURL = apiClient.defaults.baseURL ?? '';

    const query = useQuery({
        queryKey: ['opponents', baseURL, chain, minLevel ?? null, page],
        enabled: enabled && chain != null,
        queryFn: async () => {
            const { data } = await apiClient.get<OpponentsResponse>('/api/battle/opponents', {
                params: { chain, minLevel, page },
            });
            return data;
        },
    });

    const opponents = useMemo<OpponentPet[]>(
        () =>
            (query.data?.opponents ?? []).map((o) => ({
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
            })),
        [query.data]
    );

    return {
        ...query,
        opponents,
        total: query.data?.total ?? 0,
    };
}
