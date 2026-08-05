import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { DialogueTurn, GenerateDialogueInput } from '../../../../src/features/dialogue/dialogue.types';
import type { Persona } from '../../../../src/features/dialogue/llm/persona';

vi.mock('@config/env', () => ({
    env: { hf: { model: 'test-model', apiToken: undefined, baseUrl: '' }, jwtSecret: 'x', databaseUrl: 'x', rosterReadSource: 'postgres', indexerGrpc: { addr: '' }, nodeEnv: 'test', isProduction: false, port: 3001, corsOrigin: undefined, redis: { url: undefined } },
}));
vi.mock('../../../../src/features/dialogue/context', () => ({
    buildRivalry: vi.fn().mockResolvedValue(''),
    buildBanter: vi.fn().mockResolvedValue(''),
    buildBattleIntensity: vi.fn().mockReturnValue(''),
}));
vi.mock('../../../../src/features/dialogue/llm/fallback', () => ({
    fallbackDialogue: vi.fn(() => [
        { speaker: 'attacker', text: 'fallback', phase: 'result' },
        { speaker: 'defender', text: 'fallback', phase: 'result' },
    ] as DialogueTurn[]),
}));
vi.mock('../../../../src/features/dialogue/llm/client', () => ({
    isHuggingFaceConfigured: vi.fn().mockReturnValue(false),
    requestDialogue: vi.fn(),
}));

import { generateTurns } from '../../../../src/features/dialogue/result/turns';
import { isHuggingFaceConfigured, requestDialogue } from '../../../../src/features/dialogue/llm/client';
import { buildBanter } from '../../../../src/features/dialogue/context';

const attacker: Persona = { name: 'Rex', level: 5, rarity: 1, winCount: 3, lossCount: 1, recentOpponents: [] };
const defender: Persona = { name: 'Blaze', level: 4, rarity: 2, winCount: 2, lossCount: 2, recentOpponents: [] };

const input: GenerateDialogueInput = {
    chain: 'evm',
    battleId: 'b1',
    winner: 'attacker',
    attacker: { petId: 'p1', name: 'Rex', level: 5, rarity: 1, winCount: 3, lossCount: 1 },
    defender: { petId: 'p2', name: 'Blaze', level: 4, rarity: 2, winCount: 2, lossCount: 2 },
};

beforeEach(() => { vi.clearAllMocks(); vi.mocked(isHuggingFaceConfigured).mockReturnValue(false); });

describe('generateTurns', () => {
    it('returns fallback when HF is not configured', async () => {
        const { turns, model } = await generateTurns(input, attacker, defender);
        expect(model).toBe('fallback');
        expect(turns.length).toBeGreaterThan(0);
    });

    it('uses HF when configured and returns the model name', async () => {
        vi.mocked(isHuggingFaceConfigured).mockReturnValue(true);
        vi.mocked(requestDialogue).mockResolvedValue([
            { speaker: 'attacker', text: 'ai turn', phase: 'result' },
        ]);
        const { model } = await generateTurns(input, attacker, defender);
        expect(model).toBe('test-model');
        expect(requestDialogue).toHaveBeenCalledOnce();
    });

    it('falls back when HF call throws', async () => {
        vi.mocked(isHuggingFaceConfigured).mockReturnValue(true);
        vi.mocked(requestDialogue).mockRejectedValue(new Error('LLM down'));
        const { model } = await generateTurns(input, attacker, defender);
        expect(model).toBe('fallback');
    });

    it('uses banterOverride and skips buildBanter', async () => {
        vi.mocked(isHuggingFaceConfigured).mockReturnValue(true);
        vi.mocked(requestDialogue).mockResolvedValue([]);
        await generateTurns(input, attacker, defender, { banterOverride: 'custom banter' });
        expect(buildBanter).not.toHaveBeenCalled();
    });
});
