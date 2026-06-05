import { useMutation } from '@tanstack/react-query';
import { useApiClient } from '../contexts/ApiClientContext';
import type { PetChain } from '../types/pet';
import type { DialoguePetInput, DialogueTurn } from './useBattleDialogue';

export interface GenerateTauntsVars {
    chain: PetChain;
    attacker: DialoguePetInput;
    defender: DialoguePetInput;
}

interface TauntsResponse {
    turns: DialogueTurn[];
    model: string;
}

/**
 * Generate the AI pre-fight taunts for a matchup via
 * `POST /api/battle-dialogue/taunts`. Called imperatively on "Start Battle" so it
 * runs in parallel with the wallet confirmation. AI-only: there is no templated
 * fallback, so a failure leaves `turns` empty (the battle still proceeds).
 */
export function useBattleTaunts() {
    const apiClient = useApiClient();

    const mutation = useMutation({
        mutationFn: async (vars: GenerateTauntsVars) => {
            const { data } = await apiClient.post<TauntsResponse>('/api/battle-dialogue/taunts', vars);
            return data.turns ?? [];
        },
    });

    return {
        ...mutation,
        generate: mutation.mutate,
        turns: mutation.data ?? [],
        isLoading: mutation.isPending,
    };
}
