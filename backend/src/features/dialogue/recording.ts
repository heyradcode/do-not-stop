import { recordBattle } from '@repositories/history.repository';
import { recordConversation } from '@repositories/conversation.repository';
import { getChainSettledBattle } from '@grpc-client/battleStream';
import type { Chain } from '@typings/chain';
import { withFallback } from '@utils';
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

/**
 * Record the settled battle into `battle_history`. The winner is mapped from the
 * attacker/defender role to the concrete pet id so head-to-head tallies stay
 * correct when the pets swap roles across battles. Best-effort: a failure here
 * must not stop us from returning the dialogue.
 *
 * The client report carries no combat-sim outputs. But if the battle stream has
 * already seen this battle settle on-chain, we carry its authoritative sim
 * fields (seed/rounds/hp/xp + true fought-at) onto the row; otherwise they're
 * omitted so the upsert leaves any indexer-written values untouched and falls
 * back to the schema defaults on a fresh row.
 */
export function recordBattleHistory(input: GenerateDialogueInput): Promise<void> {
    const winnerPetId = input.winner === 'attacker' ? input.attacker.petId : input.defender.petId;
    const settled = input.battleId ? getChainSettledBattle(input.chain, input.battleId) : undefined;
    return withFallback(
        '[dialogue] failed to record battle history:',
        () =>
            recordBattle({
                chain: input.chain,
                battleId: input.battleId,
                attacker: input.attacker.petId,
                defender: input.defender.petId,
                winnerPetId,
                foughtAt: settled ? BigInt(settled.foughtAt) : BigInt(Date.now()),
                ...(settled && {
                    loserPetId: settled.loserPet,
                    seed: settled.seed,
                    rounds: settled.rounds,
                    winnerHpRemaining: settled.winnerHpRemaining,
                    xpWin: settled.xpWin,
                    xpLoss: settled.xpLoss,
                }),
            }),
        undefined,
    );
}
