import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../../../src/features/dialogue/result/result.service', async () => {
    const actual = await vi.importActual<typeof import('../../../src/features/dialogue/result/result.service')>(
        '../../../src/features/dialogue/result/result.service',
    );
    return { ...actual, getOrGenerateDialogue: vi.fn() };
});
vi.mock('../../../src/features/dialogue/taunt/taunt.service', () => ({
    streamTauntsConversation: vi.fn(),
}));
vi.mock('@repositories/roster.repository', () => ({
    getPetById: vi.fn(),
}));

import { streamBattleTaunts, resolveBattleDialogue } from '../../../src/features/dialogue/dialogue.controller';
import { ChainTruthMismatchError, getOrGenerateDialogue } from '../../../src/features/dialogue/result/result.service';
import { streamTauntsConversation } from '../../../src/features/dialogue/taunt/taunt.service';
import { getPetById } from '@repositories/roster.repository';

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

const CALLER = '0xCaller';
const authedReq = (body: unknown, address: string = CALLER) =>
    ({ body, user: { address, userId: 'u1' } }) as Request;

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPetById).mockImplementation(async (_chain, petId) =>
        (petId === 'p1' ? { owner: CALLER } : { owner: '0xSomeoneElse' }) as never,
    );
});

describe('resolveBattleDialogue', () => {
    it('returns 400 for invalid request body', async () => {
        const res = makeRes();
        await resolveBattleDialogue(authedReq({}), res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns dialogue result on success', async () => {
        const dialogue = { turns: [], model: 'test', cached: false };
        vi.mocked(getOrGenerateDialogue).mockResolvedValue(dialogue);
        const res = makeRes();
        await resolveBattleDialogue(authedReq(validResultBody), res);
        expect(res.json).toHaveBeenCalledWith(dialogue);
    });

    it('returns 500 when service throws', async () => {
        vi.mocked(getOrGenerateDialogue).mockRejectedValue(new Error('LLM down'));
        const res = makeRes();
        await resolveBattleDialogue(authedReq(validResultBody), res);
        expect(res.status).toHaveBeenCalledWith(500);
    });

    it('returns 403 when the caller owns neither pet', async () => {
        const res = makeRes();
        await resolveBattleDialogue(authedReq(validResultBody, '0xUnrelated'), res);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(getOrGenerateDialogue).not.toHaveBeenCalled();
    });

    it('returns 403 when there is no authenticated caller', async () => {
        const res = makeRes();
        await resolveBattleDialogue({ body: validResultBody } as Request, res);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(getOrGenerateDialogue).not.toHaveBeenCalled();
    });

    it('matches EVM ownership case-insensitively', async () => {
        vi.mocked(getOrGenerateDialogue).mockResolvedValue({ turns: [], model: 'test', cached: false });
        const res = makeRes();
        await resolveBattleDialogue(authedReq(validResultBody, CALLER.toUpperCase()), res);
        expect(res.status).not.toHaveBeenCalledWith(403);
    });

    it('returns 409 when the service rejects a chain-truth mismatch', async () => {
        vi.mocked(getOrGenerateDialogue).mockRejectedValue(new ChainTruthMismatchError('p2'));
        const res = makeRes();
        await resolveBattleDialogue(authedReq(validResultBody), res);
        expect(res.status).toHaveBeenCalledWith(409);
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
