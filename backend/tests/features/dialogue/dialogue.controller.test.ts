import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../../../src/features/dialogue/result/result.service', () => ({
    getOrGenerateDialogue: vi.fn(),
}));
vi.mock('../../../src/features/dialogue/taunt/taunt.service', () => ({
    streamTauntsConversation: vi.fn(),
}));

import { streamBattleTaunts, resolveBattleDialogue } from '../../../src/features/dialogue/dialogue.controller';
import { getOrGenerateDialogue } from '../../../src/features/dialogue/result/result.service';
import { streamTauntsConversation } from '../../../src/features/dialogue/taunt/taunt.service';

function makeRes() {
    const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
        setHeader: vi.fn(),
        write: vi.fn(),
        end: vi.fn(),
        headersSent: false,
    };
    return res as unknown as Response & { headersSent: boolean };
}

const pet = (id: string) => ({ petId: id, name: 'Rex', level: 5, rarity: 1, dna: '0xdna', winCount: 3, lossCount: 1 });

const validResultBody = {
    chain: 'evm',
    battleId: 'b1',
    winner: 'attacker',
    attacker: pet('p1'),
    defender: pet('p2'),
};

const validTauntsBody = {
    chain: 'evm',
    attacker: pet('p1'),
    defender: pet('p2'),
};

beforeEach(() => { vi.clearAllMocks(); });

describe('resolveBattleDialogue', () => {
    it('returns 400 for invalid request body', async () => {
        const res = makeRes();
        await resolveBattleDialogue({ body: {} } as Request, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns dialogue result on success', async () => {
        const dialogue = { turns: [], model: 'test', cached: false };
        vi.mocked(getOrGenerateDialogue).mockResolvedValue(dialogue);
        const res = makeRes();
        await resolveBattleDialogue({ body: validResultBody } as Request, res);
        expect(res.json).toHaveBeenCalledWith(dialogue);
    });

    it('returns 500 when service throws', async () => {
        vi.mocked(getOrGenerateDialogue).mockRejectedValue(new Error('LLM down'));
        const res = makeRes();
        await resolveBattleDialogue({ body: validResultBody } as Request, res);
        expect(res.status).toHaveBeenCalledWith(500);
    });
});

describe('streamBattleTaunts', () => {
    it('returns 400 for invalid request body', async () => {
        const res = makeRes();
        await streamBattleTaunts({ body: {} } as Request, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('streams turns and ends the response', async () => {
        const turns = [{ speaker: 'attacker', text: 'Ready?', phase: 'taunt' }];
        async function* gen() { yield turns; }
        vi.mocked(streamTauntsConversation).mockReturnValue(gen() as never);
        const res = makeRes();
        await streamBattleTaunts({ body: validTauntsBody } as Request, res);
        expect(res.write).toHaveBeenCalled();
        expect(res.end).toHaveBeenCalled();
    });

    it('returns 502 when streaming throws before headers are sent', async () => {
        async function* gen() { throw new Error('HF down'); yield []; }
        vi.mocked(streamTauntsConversation).mockReturnValue(gen() as never);
        const res = makeRes();
        await streamBattleTaunts({ body: validTauntsBody } as Request, res);
        expect(res.status).toHaveBeenCalledWith(502);
    });

    it('calls res.end (not res.status) when error occurs after headers sent', async () => {
        async function* gen() { throw new Error('mid-stream'); yield []; }
        vi.mocked(streamTauntsConversation).mockReturnValue(gen() as never);
        const res = makeRes();
        res.headersSent = true;
        await streamBattleTaunts({ body: validTauntsBody } as Request, res);
        expect(res.status).not.toHaveBeenCalled();
        expect(res.end).toHaveBeenCalled();
    });
});
