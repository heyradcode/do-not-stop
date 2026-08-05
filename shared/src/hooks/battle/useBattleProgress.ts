import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApiClient } from '../../contexts/ApiClientContext';
import { useAuth } from '../../contexts/AuthContext';
import type { Pet, PetChain } from '../../types/pet';

const BATTLE_PROGRESS_QUERY = `
    query BattleProgress($chain: String!, $petIds: [String!]!) {
        battleProgress(chain: $chain, petIds: $petIds) {
            id level xp winCount lossCount readyAt
        }
    }
`;

interface ProgressDto {
    id: string;
    level: number;
    xp: number;
    winCount: number;
    lossCount: number;
    readyAt: number;
}

interface GraphQLResponse {
    data?: { battleProgress: ProgressDto[] };
    errors?: { message: string }[];
}

/**
 * Applies one pet's backend progression, if it has any.
 *
 * Exported for the merge test: the rule is small but it is the whole reason a player's
 * level stops being wrong, so it is pinned rather than left implicit in a `useMemo`.
 */
export const mergeBattleProgress = (pet: Pet, progress: ProgressDto | undefined): Pet => {
    if (!progress) {
        return pet;
    }
    return {
        ...pet,
        level: progress.level,
        xp: progress.xp,
        winCount: progress.winCount,
        lossCount: progress.lossCount,
        // Independent cooldowns with different owners: breeding writes the on-chain one,
        // battles write the backend one. The pet is ready only when neither holds it.
        readyAt: Math.max(pet.readyAt, progress.readyAt),
    };
};

/**
 * Merges backend battle progression into pets read straight from the chain.
 *
 * A player's own pet list comes from PetCore / the Solana program directly, and battles
 * stopped writing there when they moved off chain (§L Phase 6). Without this a player who
 * has won fifty backend battles still sees the level, XP and win/loss they minted with.
 *
 * The backend's own reads (opponents, pet detail, search) already merge this server-side;
 * this hook exists solely for the one surface that cannot, because the client — not the
 * backend — is the one holding the chain data.
 *
 * Degrades to unmerged chain values on any failure. That is the honest fallback: stale
 * progression is a worse number, an error is a missing pet list.
 */
export const useBattleProgress = (chain: PetChain | null, pets: Pet[]): Pet[] => {
    const apiClient = useApiClient();
    const { isAuthenticated } = useAuth();
    const baseURL = apiClient.defaults.baseURL ?? '';

    // Sorted so the key is stable under pet-list reordering, which would otherwise refetch.
    const petIds = useMemo(() => pets.map((pet) => pet.id).sort(), [pets]);

    const query = useQuery({
        queryKey: ['battleProgress', baseURL, chain, petIds],
        enabled: chain != null && isAuthenticated && petIds.length > 0,
        queryFn: async () => {
            const { data } = await apiClient.post<GraphQLResponse>('/graphql', {
                query: BATTLE_PROGRESS_QUERY,
                variables: { chain, petIds },
            });
            if (data.errors?.length) {
                throw new Error(data.errors.map((e) => e.message).join('; '));
            }
            return data.data?.battleProgress ?? [];
        },
    });

    return useMemo(() => {
        if (!query.data?.length) {
            return pets;
        }
        const byPetId = new Map(query.data.map((row) => [row.id, row]));
        return pets.map((pet) => mergeBattleProgress(pet, byPetId.get(pet.id)));
    }, [pets, query.data]);
};
