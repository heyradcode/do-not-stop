import { useQuery } from '@tanstack/react-query';
import { useApiClient } from '../../contexts/ApiClientContext';
import { useAuth } from '../../contexts/AuthContext';
import type { PetChain } from '../../types/pet';

export type DialogueSpeaker = 'attacker' | 'defender';
export type DialoguePhase = 'taunt' | 'result';

export interface DialogueTurn {
    speaker: DialogueSpeaker;
    phase: DialoguePhase;
    text: string;
}

/** Pet attributes the backend turns into a persona (dna serialized as string). */
export interface DialoguePetInput {
    petId: string;
    name: string;
    level: number;
    rarity: number;
    dna: string;
    winCount: number;
    lossCount: number;
}

export interface UseBattleDialogueOptions {
    chain: PetChain | null;
    /** Stable per-battle key (EVM: tx hash; Solana: settle signature). */
    battleId: string | null;
    attacker: DialoguePetInput | null;
    defender: DialoguePetInput | null;
    winner: DialogueSpeaker | null;
    leveledUp?: boolean;
    /** Override the default enabled state. */
    enabled?: boolean;
}

interface DialogueResponse {
    turns: DialogueTurn[];
    model: string;
    cached: boolean;
}

/**
 * Fetch (or lazily generate) the conversation for a settled battle via
 * `POST /api/battle-dialogue/result`. The endpoint is idempotent and keyed by
 * `battleId`, so re-mounts return the same stored conversation. Requires an
 * authenticated session (the route is JWT-gated).
 */
export const useBattleDialogue = (options: UseBattleDialogueOptions) => {
    const apiClient = useApiClient();
    const { isAuthenticated } = useAuth();

    const { chain, battleId, attacker, defender, winner, leveledUp, enabled = true } = options;
    const ready = Boolean(chain && battleId && attacker && defender && winner);

    const query = useQuery({
        queryKey: ['battle-dialogue', chain, battleId],
        enabled: enabled && ready && isAuthenticated,
        // Battles are immutable — never refetch a generated conversation.
        staleTime: Infinity,
        gcTime: Infinity,
        retry: false,
        queryFn: async () => {
            const { data } = await apiClient.post<DialogueResponse>('/api/battle-dialogue/result', {
                chain,
                battleId,
                attacker,
                defender,
                winner,
                ...(leveledUp !== undefined ? { leveledUp } : {}),
            });
            return data.turns ?? [];
        },
    });

    return {
        ...query,
        turns: query.data ?? [],
    };
};
