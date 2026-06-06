import type { GenerateDialogueInput, DialogueTurn } from '../dialogue.types';
import type { Persona } from '../prompting/persona';
import { MAX_TURNS, MAX_TURN_CHARS } from '../dialogue.schema';

function clampTurns(turns: DialogueTurn[]): DialogueTurn[] {
    return turns
        .filter((t) => typeof t.text === 'string' && t.text.trim().length > 0)
        .slice(0, MAX_TURNS)
        .map((t) => ({
            speaker: (['defender', 'fighter_b', 'b', 'opponent'].includes(
                typeof t.speaker === 'string' ? t.speaker.toLowerCase().trim() : '',
            ))
                ? 'defender'
                : 'attacker',
            phase: t.phase === 'result' ? 'result' : 'taunt',
            text: t.text.trim().slice(0, MAX_TURN_CHARS),
        }));
}

const ELEMENT_TAUNT: Record<string, string> = {
    fire: 'You feel that heat? It only ends one way.',
    water: 'I flow around everything you throw. Try harder.',
    electric: "Too slow! You won't even see the spark.",
    nature: "I'm rooted, steady, and patient. You'll tire first.",
    shadow: 'I am the chill down your spine. Run.',
    cosmic: 'The stars already wrote how this ends.',
};

export function fallbackDialogue(
    input: GenerateDialogueInput,
    attacker: Persona,
    defender: Persona,
): DialogueTurn[] {
    const winnerLine =
        input.winner === 'attacker'
            ? 'Told you. Better luck next time.'
            : 'A win is a win — see you in the rematch.';
    const loserLine = 'Lucky shot. I want a rematch.';

    return clampTurns([
        { speaker: 'attacker', phase: 'taunt', text: ELEMENT_TAUNT[attacker.element] ?? 'Let us settle this.' },
        { speaker: 'defender', phase: 'taunt', text: ELEMENT_TAUNT[defender.element] ?? 'Bring it on.' },
        { speaker: input.winner, phase: 'result', text: winnerLine },
        { speaker: input.winner === 'attacker' ? 'defender' : 'attacker', phase: 'result', text: loserLine },
    ]);
}
