import { useMutation } from '@tanstack/react-query';
import { useApiClient } from '../contexts/ApiClientContext';
import type { PetChain } from '../types/pet';
import type { DialoguePetInput } from './useBattleDialogue';

export interface PrepareDialogueVars {
    chain: PetChain;
    /** Stable per-battle key (EVM: tx hash; Solana: settle signature). */
    battleId: string;
    attacker: DialoguePetInput;
    defender: DialoguePetInput;
}

/**
 * Pre-generate a battle's result dialogue via
 * `POST /api/battle-dialogue/prepare`, fired once the tx hash is known (while the
 * battle is still confirming on-chain). The backend generates both outcomes in
 * the background; the later `useBattleDialogue` read then returns the matching
 * one instantly. Fire-and-forget — failures are harmless (the result read falls
 * back to on-demand generation).
 */
export function usePrepareDialogue() {
    const apiClient = useApiClient();

    const mutation = useMutation({
        mutationFn: async (vars: PrepareDialogueVars) => {
            await apiClient.post('/api/battle-dialogue/prepare', vars);
        },
    });

    return { prepare: mutation.mutate };
}
