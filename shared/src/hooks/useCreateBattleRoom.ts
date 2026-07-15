import { useCallback, useState } from 'react';
import { useApiClient } from '../contexts/ApiClientContext';
import type { PetChain } from '../types/pet';

export interface CreateRoomVars {
    chain: PetChain;
    attackerPetId: string;
    defenderPetId: string;
}

interface CreateRoomResponse {
    roomId: string;
}

/**
 * Mints a shareable room id for a matchup via `POST /api/battle-room`, called
 * imperatively on "Start Battle" (same moment as useBattleTaunts) so the URL
 * can become /battle/:roomId before the wallet even signs — there is no
 * on-chain identifier (tx hash / requestId) available yet at that point.
 * Best-effort: a failure just means no room URL for this attempt; the battle
 * itself proceeds regardless (mirrors useBattleTaunts's no-fallback stance).
 */
export const useCreateBattleRoom = () => {
    const apiClient = useApiClient();
    const [isLoading, setIsLoading] = useState(false);

    const createRoom = useCallback(
        async (vars: CreateRoomVars): Promise<string | null> => {
            setIsLoading(true);
            try {
                const { data } = await apiClient.post<CreateRoomResponse>('/api/battle-room', vars);
                return data.roomId;
            } catch {
                return null;
            } finally {
                setIsLoading(false);
            }
        },
        [apiClient],
    );

    return { createRoom, isLoading };
};
