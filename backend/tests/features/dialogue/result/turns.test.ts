import { describe, it, expect } from 'vitest';
import { ensureResultCoverage } from '../../../../src/features/dialogue/result/turns';
import { buildPersona } from '../../../../src/features/dialogue/llm/persona';
import type {
    DialogueTurn,
    GenerateDialogueInput,
    PetPersonaInput,
} from '../../../../src/features/dialogue/dialogue.types';

const petInput = (dna: string): PetPersonaInput => ({
    petId: `pet-${dna}`,
    name: 'N',
    level: 1,
    rarity: 1,
    dna,
    winCount: 0,
    lossCount: 0,
});

const input: GenerateDialogueInput = {
    chain: 'evm',
    battleId: 'b1',
    attacker: petInput('0'),
    defender: petInput('1'),
    winner: 'attacker',
};
const attacker = buildPersona(petInput('0'));
const defender = buildPersona(petInput('1'));

const resultSpeakers = (turns: DialogueTurn[]) =>
    new Set(turns.filter((t) => t.phase === 'result').map((t) => t.speaker));

describe('ensureResultCoverage', () => {
    it('leaves turns untouched when both fighters already have a result line', () => {
        const turns: DialogueTurn[] = [
            { speaker: 'attacker', phase: 'result', text: 'I win.' },
            { speaker: 'defender', phase: 'result', text: 'Rematch.' },
        ];
        expect(ensureResultCoverage(turns, input, attacker, defender)).toBe(turns);
    });

    it('backfills the defender result line when only the attacker reacted', () => {
        const turns: DialogueTurn[] = [
            { speaker: 'attacker', phase: 'taunt', text: 'Heat.' },
            { speaker: 'attacker', phase: 'result', text: 'Told you.' },
        ];
        const out = ensureResultCoverage(turns, input, attacker, defender);
        expect(resultSpeakers(out).has('defender')).toBe(true);
        expect(out.length).toBeGreaterThan(turns.length);
    });

    it('backfills the attacker result line when only the defender reacted', () => {
        const turns: DialogueTurn[] = [{ speaker: 'defender', phase: 'result', text: 'Won.' }];
        const out = ensureResultCoverage(turns, input, attacker, defender);
        expect(resultSpeakers(out).has('attacker')).toBe(true);
        expect(resultSpeakers(out).has('defender')).toBe(true);
    });

    it('backfills both result lines when none are present', () => {
        const turns: DialogueTurn[] = [{ speaker: 'attacker', phase: 'taunt', text: 'Heat.' }];
        const out = ensureResultCoverage(turns, input, attacker, defender);
        expect(resultSpeakers(out)).toEqual(new Set(['attacker', 'defender']));
    });

    it('preserves the original turns at the front of the result', () => {
        const turns: DialogueTurn[] = [{ speaker: 'attacker', phase: 'result', text: 'Told you.' }];
        const out = ensureResultCoverage(turns, input, attacker, defender);
        expect(out.slice(0, turns.length)).toEqual(turns);
    });
});
