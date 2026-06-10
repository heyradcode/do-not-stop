import type { HeadToHead, RecentForm } from '@repositories/history.repository';
import type { DialogueTurn } from '../dialogue.types';

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
