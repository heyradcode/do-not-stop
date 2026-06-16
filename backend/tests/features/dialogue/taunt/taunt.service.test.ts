import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { DialogueTurn } from '../../../../src/features/dialogue/dialogue.types';

vi.mock('../../../../src/features/dialogue/llm/client', () => ({
    isHuggingFaceConfigured: vi.fn().mockReturnValue(false),
    streamTaunts: vi.fn(),
}));
vi.mock('../../../../src/features/dialogue/context', () => ({
    buildBanter: vi.fn().mockResolvedValue(''),
    buildRivalry: vi.fn().mockResolvedValue(''),
}));
vi.mock('../../../../src/features/dialogue/recording', () => ({
    recordConversationSafe: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../../src/features/dialogue/result/pregen.service', () => ({
    startResultPregen: vi.fn(),
}));
vi.mock('../../../../src/features/dialogue/llm/persona', () => ({
    buildPersona: vi.fn((p: { name: string }) => ({ name: p.name, level: 1, rarity: 1, winCount: 0, lossCount: 0, recentOpponents: [] })),
}));

import { streamTauntsConversation } from '../../../../src/features/dialogue/taunt/taunt.service';
import { isHuggingFaceConfigured, streamTaunts } from '../../../../src/features/dialogue/llm/client';
import { startResultPregen } from '../../../../src/features/dialogue/result/pregen.service';

const input = {
    chain: 'evm' as const,
    attacker: { petId: 'p1', name: 'Rex', level: 5, rarity: 1, dna: '0x', winCount: 3, lossCount: 1 },
    defender: { petId: 'p2', name: 'Blaze', level: 4, rarity: 2, dna: '0x', winCount: 2, lossCount: 2 },
};

beforeEach(() => { vi.clearAllMocks(); vi.mocked(isHuggingFaceConfigured).mockReturnValue(false); });

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
    const results: T[] = [];
    for await (const v of gen) results.push(v);
    return results;
}

describe('streamTauntsConversation', () => {
    it('throws when HF is not configured', async () => {
        await expect(collect(streamTauntsConversation(input))).rejects.toThrow('HF inference is not configured');
    });

    it('yields each batch of turns as they arrive', async () => {
        vi.mocked(isHuggingFaceConfigured).mockReturnValue(true);
        const batch1: DialogueTurn[] = [{ speaker: 'attacker', text: 'Yo', phase: 'taunt' }];
        const batch2: DialogueTurn[] = [...batch1, { speaker: 'defender', text: 'Bring it', phase: 'taunt' }];
        async function* fakeStream() { yield batch1; return batch2; }
        vi.mocked(streamTaunts).mockReturnValue(fakeStream() as never);

        const results = await collect(streamTauntsConversation(input));
        expect(results.length).toBeGreaterThanOrEqual(1);
        expect(results[0]).toBe(batch1);
    });

    it('yields final batch when it adds a new turn', async () => {
        vi.mocked(isHuggingFaceConfigured).mockReturnValue(true);
        const batch1: DialogueTurn[] = [{ speaker: 'attacker', text: 'Yo', phase: 'taunt' }];
        const batch2: DialogueTurn[] = [...batch1, { speaker: 'defender', text: 'Bring it', phase: 'taunt' }];
        async function* fakeStream() { yield batch1; return batch2; }
        vi.mocked(streamTaunts).mockReturnValue(fakeStream() as never);

        const results = await collect(streamTauntsConversation(input));
        // Final batch has one more turn than last yielded, so it should also be emitted.
        expect(results[results.length - 1]).toBe(batch2);
    });

    it('kicks off result pregen after streaming completes', async () => {
        vi.mocked(isHuggingFaceConfigured).mockReturnValue(true);
        const turns: DialogueTurn[] = [{ speaker: 'attacker', text: 'Ready', phase: 'taunt' }];
        async function* fakeStream() { yield turns; return turns; }
        vi.mocked(streamTaunts).mockReturnValue(fakeStream() as never);

        await collect(streamTauntsConversation(input));
        expect(startResultPregen).toHaveBeenCalledOnce();
    });
});
