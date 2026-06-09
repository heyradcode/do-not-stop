import { recordBattle } from '@repositories/history.repository';
import { recordConversation } from '@repositories/conversation.repository';
import type { Chain } from '@typings/chain';
import { bestEffort } from './best-effort';
import type { DialogueTurn, GenerateDialogueInput } from './dialogue.types';

/**
 * Best-effort persistence side effects for the dialogue feature. Every write here
 * is non-blocking: a failure is logged and swallowed so it never breaks the
 * response the player is waiting on.
 */

/** Persist transcript lines, swallowing failures so generation is never blocked. */
export function recordConversationSafe(
    meta: { chain: Chain; attacker: string; defender: string; battleId?: string | null },
    turns: DialogueTurn[],
): Promise<void> {
    return bestEffort('failed to record conversation', () => recordConversation(meta, turns), undefined);
}

/** Append only the result-phase lines to the transcript (taunts came pre-fight). */
export function recordResultLines(input: GenerateDialogueInput, turns: DialogueTurn[]): Promise<void> {
    const resultTurns = turns.filter((t) => t.phase === 'result');
    return recordConversationSafe(
        {
            chain: input.chain,
            attacker: input.attacker.petId,
            defender: input.defender.petId,
            battleId: input.battleId,
        },
        resultTurns,
    );
}

/**
 * Record the settled battle into `battle_history`. The winner is mapped from the
 * attacker/defender role to the concrete pet id so head-to-head tallies stay
 * correct when the pets swap roles across battles. Best-effort: a failure here
 * must not stop us from returning the dialogue.
 */
export function recordBattleHistory(input: GenerateDialogueInput): Promise<void> {
    const winnerPetId = input.winner === 'attacker' ? input.attacker.petId : input.defender.petId;
    return bestEffort(
        'failed to record battle history',
        () =>
            recordBattle({
                chain: input.chain,
                battleId: input.battleId,
                attacker: input.attacker.petId,
                defender: input.defender.petId,
                winnerPetId,
                foughtAt: BigInt(Date.now()),
            }),
        undefined,
    );
}
