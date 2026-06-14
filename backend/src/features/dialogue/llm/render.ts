import type { HeadToHead, RecentForm } from '@repositories/history.repository';
import type { SettledBattle } from '../../../grpc/battleStream';
import type { DialogueTurn } from '../dialogue.types';

/** A blowout ends fast; a nail-biter drags. These bound the round-count flavor. */
const QUICK_ROUNDS = 3;
const GRUELING_ROUNDS = 12;

const fighterLabel = (speaker: DialogueTurn['speaker']): string =>
    speaker === 'attacker' ? 'fighter A' : 'fighter B';

export function buildRivalryContext(
    headToHead: HeadToHead,
    attackerForm: RecentForm,
    defenderForm: RecentForm,
    attackerId: string,
    defenderId: string,
): string {
    const meetings = (): string => {
        if (headToHead.total === 0) return 'First meeting between these two.';

        const attackerWins = headToHead.winsByPet[attackerId] ?? 0;
        const defenderWins = headToHead.winsByPet[defenderId] ?? 0;
        if (attackerWins === defenderWins) {
            return `They have met ${headToHead.total} times — evenly split ${attackerWins}-${defenderWins}.`;
        }

        const leader = attackerWins > defenderWins ? 'fighter A' : 'fighter B';
        const high = Math.max(attackerWins, defenderWins);
        const low = Math.min(attackerWins, defenderWins);

        return `They have met ${headToHead.total} times — ${leader} leads ${high}-${low}.`;
    };

    const form = (f: RecentForm): string =>
        f.total === 0 ? 'no recent battles' : `${f.wins}W-${f.losses}L recently`;

    return [
        meetings(),
        `Form: fighter A ${form(attackerForm)}, fighter B ${form(defenderForm)}.`,
    ].join(' ');
}

export function buildBanterContext(turns: DialogueTurn[]): string {
    return turns.map((t) => `${fighterLabel(t.speaker)}: ${t.text}`).join('\n');
}

/**
 * Flavor the result prompt with how the (chain-settled) fight actually went:
 * the round count separates a rout from a nail-biter, the surviving HP sets the
 * margin, and the XP swing sets the stakes. Never names the winner — the outcome
 * block already fixes that; this only colors how hard-won it was. Returns '' when
 * there's nothing meaningful to say (all defaults / a v1 row).
 */
export function buildBattleSummaryContext(settled: SettledBattle): string {
    const intensity =
        settled.rounds <= 0
            ? ''
            : settled.rounds <= QUICK_ROUNDS
              ? `A swift, decisive bout — over in ${settled.rounds} round${settled.rounds === 1 ? '' : 's'}.`
              : settled.rounds >= GRUELING_ROUNDS
                ? `A grueling war of ${settled.rounds} rounds.`
                : `A back-and-forth ${settled.rounds}-round fight.`;

    const margin =
        settled.winnerHpRemaining > 0 ? `The winner finished with ${settled.winnerHpRemaining} HP left.` : '';

    const stakes =
        settled.xpWin > 0 || settled.xpLoss > 0
            ? `XP earned: winner +${settled.xpWin}, loser +${settled.xpLoss}.`
            : '';

    return [intensity, margin, stakes].filter(Boolean).join(' ');
}
