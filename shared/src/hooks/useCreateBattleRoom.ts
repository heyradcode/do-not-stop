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
 * imperatively on "Start Battle" — before the wallet even signs, since there is
 * no on-chain identifier (tx hash / requestId) available at that point. The
 * caller (useBattlePanel's handleBattle) awaits this and keeps the Start Battle
 * button in a loading state (`isLoading`) until it settles, then proceeds to
 * taunts/wallet either way: a failure (logged here) just means no room URL for
 * this attempt, never a blocked battle.
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
            } catch (err) {
                console.error('[battle-room] failed to create room:', err);
                return null;
            } finally {
                setIsLoading(false);
            }
        },
        [apiClient],
    );

    return { createRoom, isLoading };
};
