import { getPetElement, type DialogueTurn, type OpponentPet, type Pet } from '@shared/core';

/**
 * Instant, client-side pre-fight banter. Element-based templates (mirrors the
 * backend fallback) so the taunts play immediately on Start Battle without
 * waiting on the model — the wallet confirmation never stalls on AI latency.
 * The AI is used only for the post-settle result reactions.
 */
const ELEMENT_TAUNT: Record<string, string> = {
    fire: 'You feel that heat? It only ends one way.',
    water: 'I flow around everything you throw. Try harder.',
    electric: "Too slow! You won't even see the spark.",
    nature: "I'm rooted, steady, and patient. You'll tire first.",
    shadow: 'I am the chill down your spine. Run.',
    cosmic: 'The stars already wrote how this ends.',
};

export function buildPrefightTaunts(
    attacker: Pet | null,
    defender: OpponentPet | undefined,
): DialogueTurn[] {
    if (!attacker || !defender) return [];
    return [
        {
            speaker: 'attacker',
            phase: 'taunt',
            text: ELEMENT_TAUNT[getPetElement(attacker.dna)] ?? 'Let us settle this.',
        },
        {
            speaker: 'defender',
            phase: 'taunt',
            text: ELEMENT_TAUNT[getPetElement(defender.dna)] ?? 'Bring it on.',
        },
    ];
}
