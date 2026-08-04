import { recordConversation } from '@repositories/conversation.repository';
import type { Chain } from '@typings/chain';
import { withFallback } from '@utils';
import type { DialogueTurn, GenerateDialogueInput } from './dialogue.types';

/**
 * Best-effort persistence side effects for the dialogue feature. Every write here is
 * non-blocking: a failure is logged and swallowed so it never breaks the response the
 * player is waiting on.
 *
 * `battle_history` is deliberately not written from here any more. It used to be, from the
 * client's own result report, back when the indexer wrote the authoritative row from an
 * on-chain settle event and this only filled gaps. The battle worker now writes that row
 * from the signed receipt, in the receipt's own transaction, so writing here would let a
 * client's claim overwrite what was actually signed.
 */

/** Persist transcript lines, swallowing failures so generation is never blocked. */
export function recordConversationSafe(
    meta: { chain: Chain; attacker: string; defender: string; battleId?: string | null },
    turns: DialogueTurn[],
): Promise<void> {
    return withFallback('[dialogue] failed to record conversation:', () => recordConversation(meta, turns), undefined);
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
