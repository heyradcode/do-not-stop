import { describe, expect, it } from 'vitest';
import { buildUserMessage, buildTauntUserMessage, SYSTEM_PROMPT, JSON_FORMAT_INSTRUCTION } from '../../../../src/features/dialogue/llm/prompt';
import type { Persona } from '../../../../src/features/dialogue/llm/persona';

const attacker: Persona = { name: 'Rex', level: 5, rarity: 1, winCount: 3, lossCount: 1, recentOpponents: [] };
const defender: Persona = { name: 'Blaze', level: 4, rarity: 2, winCount: 2, lossCount: 2, recentOpponents: [] };

const input = {
    chain: 'evm' as const,
    battleId: 'b1',
    winner: 'attacker' as const,
    leveledUp: false,
    attacker: { petId: 'p1', name: 'Rex', level: 5, rarity: 1, winCount: 3, lossCount: 1 },
    defender: { petId: 'p2', name: 'Blaze', level: 4, rarity: 2, winCount: 2, lossCount: 2 },
};

describe('SYSTEM_PROMPT / JSON_FORMAT_INSTRUCTION', () => {
    it('SYSTEM_PROMPT is a non-empty string', () => {
        expect(typeof SYSTEM_PROMPT).toBe('string');
        expect(SYSTEM_PROMPT.length).toBeGreaterThan(0);
    });

    it('JSON_FORMAT_INSTRUCTION mentions attacker and defender', () => {
        expect(JSON_FORMAT_INSTRUCTION).toContain('attacker');
        expect(JSON_FORMAT_INSTRUCTION).toContain('defender');
    });
});

describe('buildUserMessage', () => {
    it('includes both fighter tags', () => {
        const msg = buildUserMessage(input, attacker, defender);
        expect(msg).toContain('<fighter_a');
        expect(msg).toContain('<fighter_b');
    });

    it('includes the outcome tag with winner', () => {
        const msg = buildUserMessage(input, attacker, defender);
        expect(msg).toContain('winner="attacker"');
        expect(msg).toContain('leveled_up="false"');
    });

    it('includes rivalry block when provided', () => {
        const msg = buildUserMessage(input, attacker, defender, 'rivalry text');
        expect(msg).toContain('<history>rivalry text</history>');
    });

    it('includes banter block when provided', () => {
        const msg = buildUserMessage(input, attacker, defender, undefined, 'banter text');
        expect(msg).toContain('<recent_banter>banter text</recent_banter>');
    });

    it('includes battle_summary block when intensity provided', () => {
        const msg = buildUserMessage(input, attacker, defender, undefined, undefined, 'intense fight');
        expect(msg).toContain('<battle_summary>intense fight</battle_summary>');
    });

    it('omits optional blocks when not provided', () => {
        const msg = buildUserMessage(input, attacker, defender);
        expect(msg).not.toContain('<history>');
        expect(msg).not.toContain('<recent_banter>');
        expect(msg).not.toContain('<battle_summary>');
    });

    it('sanitizes pet names to strip control chars', () => {
        const badInput = { ...input, attacker: { ...input.attacker, name: '<script>alert(1)</script>' } };
        const msg = buildUserMessage(badInput, attacker, defender);
        expect(msg).not.toContain('<script>');
    });
});

describe('buildTauntUserMessage', () => {
    it('includes both fighter tags', () => {
        const msg = buildTauntUserMessage('Rex', 'Blaze', attacker, defender);
        expect(msg).toContain('<fighter_a');
        expect(msg).toContain('<fighter_b');
    });

    it('does not include an outcome tag', () => {
        const msg = buildTauntUserMessage('Rex', 'Blaze', attacker, defender);
        expect(msg).not.toContain('<outcome');
    });

    it('includes rivalry and banter when provided', () => {
        const msg = buildTauntUserMessage('Rex', 'Blaze', attacker, defender, 'rivalry', 'banter');
        expect(msg).toContain('<history>rivalry</history>');
        expect(msg).toContain('<recent_banter>banter</recent_banter>');
    });
});
