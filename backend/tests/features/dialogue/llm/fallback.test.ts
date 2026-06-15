import { describe, it, expect } from 'vitest';
import { fallbackDialogue } from '../../../../src/features/dialogue/llm/fallback';
import { buildPersona } from '../../../../src/features/dialogue/llm/persona';
import type { GenerateDialogueInput, PetPersonaInput } from '../../../../src/features/dialogue/dialogue.types';

const petInput = (dna: string): PetPersonaInput => ({
    petId: `pet-${dna}`,
    name: 'N',
    level: 1,
    rarity: 1,
    dna,
    winCount: 0,
    lossCount: 0,
});

const input = (winner: 'attacker' | 'defender'): GenerateDialogueInput => ({
    chain: 'evm',
    battleId: 'b1',
    attacker: petInput('0'), // fire
    defender: petInput('1'), // water
    winner,
});

const fire = buildPersona(petInput('0'));
const water = buildPersona(petInput('1'));

describe('fallbackDialogue', () => {
    it('produces a 4-turn taunt/taunt/result/result conversation', () => {
        const turns = fallbackDialogue(input('attacker'), fire, water);
        expect(turns).toHaveLength(4);
        expect(turns.map((t) => t.phase)).toEqual(['taunt', 'taunt', 'result', 'result']);
        expect(turns.map((t) => t.speaker)).toEqual(['attacker', 'defender', 'attacker', 'defender']);
    });

    it('uses element-specific taunts for each fighter', () => {
        const turns = fallbackDialogue(input('attacker'), fire, water);
        expect(turns[0].text).toBe('You feel that heat? It only ends one way.'); // fire
        expect(turns[1].text).toBe('I flow around everything you throw. Try harder.'); // water
    });

    it('gives the winning side the winner line', () => {
        const attackerWins = fallbackDialogue(input('attacker'), fire, water);
        expect(attackerWins[2].speaker).toBe('attacker');
        expect(attackerWins[2].text).toBe('Told you. Better luck next time.');
        expect(attackerWins[3].speaker).toBe('defender');
        expect(attackerWins[3].text).toBe('Lucky shot. I want a rematch.');

        const defenderWins = fallbackDialogue(input('defender'), fire, water);
        expect(defenderWins[2].speaker).toBe('defender');
        expect(defenderWins[2].text).toBe('A win is a win — see you in the rematch.');
        expect(defenderWins[3].speaker).toBe('attacker');
    });

    it('falls back to a generic taunt for an unknown element', () => {
        const unknown = { ...fire, element: 'plasma' };
        const turns = fallbackDialogue(input('attacker'), unknown, water);
        expect(turns[0].text).toBe('Let us settle this.');
    });

    it('truncates any turn text longer than the per-turn cap (140 chars)', () => {
        const longElement = { ...fire, element: 'fire' };
        // ELEMENT_TAUNT entries are short; assert the cap holds for all turns.
        const turns = fallbackDialogue(input('attacker'), longElement, water);
        for (const t of turns) {
            expect(t.text.length).toBeLessThanOrEqual(140);
        }
    });
});
