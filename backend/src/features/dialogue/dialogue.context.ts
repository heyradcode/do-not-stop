import type { HeadToHead, RecentForm } from '@repositories/history.repository';
import type { DialogueTurn } from './dialogue.types';

export function buildRivalryContext(
    headToHead: HeadToHead,
    attackerForm: RecentForm,
    defenderForm: RecentForm,
    attackerId: string,
    defenderId: string,
): string {
    const lines: string[] = [];

    if (headToHead.total === 0) {
        lines.push('First meeting between these two.');
    } else {
        const a = headToHead.winsByPet[attackerId] ?? 0;
        const b = headToHead.winsByPet[defenderId] ?? 0;
        if (a === b) {
            lines.push(`They have met ${headToHead.total} times — evenly split ${a}-${b}.`);
        } else {
            const leader = a > b ? 'fighter A' : 'fighter B';
            lines.push(`They have met ${headToHead.total} times — ${leader} leads ${Math.max(a, b)}-${Math.min(a, b)}.`);
        }
    }

    const form = (f: RecentForm) => (f.total === 0 ? 'no recent battles' : `${f.wins}W-${f.losses}L recently`);
    lines.push(`Form: fighter A ${form(attackerForm)}, fighter B ${form(defenderForm)}.`);

    return lines.join(' ');
}

export function buildBanterContext(turns: DialogueTurn[]): string {
    if (turns.length === 0) return '';
    return turns
        .map((t) => `${t.speaker === 'attacker' ? 'fighter A' : 'fighter B'}: ${t.text}`)
        .join('\n');
}
