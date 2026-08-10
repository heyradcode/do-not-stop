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
            total page pageSize emptyReason
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
    emptyReason?: OpponentsEmptyReason | null;
}

/**
 * Why the picker is empty, when it is.
 *
 * Four situations look identical to a player and only some are theirs to act on, so the
 * server names which one rather than leaving the UI to say "none" and stop there.
 */
export type OpponentsEmptyReason =
    | 'roster-empty'
    | 'all-yours'
    | 'all-on-cooldown'
    | 'below-min-level'
    | 'no-consent'
    | 'consent-stale';

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
    /** Set only when the list is empty; see `OpponentsEmptyReason`. */
    emptyReason: OpponentsEmptyReason | null;
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
        emptyReason: query.data?.emptyReason ?? null,
        isLoading: query.isLoading,
        error: query.error as Error | null,
        refetch: query.refetch,
    };
};

/**
 * What to tell the player, per reason.
 *
 * Written for someone who wants to battle and cannot, so each one names the thing that
 * would change the answer. `roster-empty` is deliberately blunt about being our problem
 * rather than theirs: no amount of waiting or re-clicking fixes an indexer that is not
 * running, and pretending otherwise sends people hunting for a mistake they did not make.
 */
export function describeNoOpponents(reason: OpponentsEmptyReason | null): string {
    switch (reason) {
        case 'roster-empty':
            return 'No pets have been indexed yet, so there is nobody to match you against. This is a server-side gap rather than anything you have done.';
        case 'all-yours':
            return 'Every indexed pet belongs to you. You need another player before a battle is possible.';
        case 'all-on-cooldown':
            return 'Every eligible pet is still recovering from its last battle. Try again shortly.';
        case 'below-min-level':
            return 'No pet meets the level you asked for. Lower the minimum level to widen the search.';
        case 'no-consent':
            return 'Nobody has allowed challenges yet. Opponents appear once another player turns on Allow Challenges.';
        case 'consent-stale':
            return 'Players have allowed challenges, but under an older set of battle rules, so those permissions no longer apply. They need to turn on Allow Challenges again.';
        default:
            return 'No opponents available';
    }
}
