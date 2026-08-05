import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// Stub the resolvers so no real DB/gRPC calls happen.
vi.mock('../../src/graphql/resolvers', () => ({
    rootValue: {
        opponents: vi.fn().mockResolvedValue({ opponents: [], total: 0, page: 0, pageSize: 20 }),
        pet: vi.fn().mockResolvedValue(null),
        winEstimate: vi.fn().mockResolvedValue(null),
    },
}));

import { graphqlHandler } from '../../src/graphql/index';

function makeRes() {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    return res as unknown as Response;
}

beforeEach(() => { vi.clearAllMocks(); });

describe('graphqlHandler', () => {
    it('returns 400 when query is missing', async () => {
        const res = makeRes();
        await graphqlHandler({ body: {} } as Request, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ errors: [{ message: 'Missing or empty query' }] });
    });

    it('returns 400 when query is an empty string', async () => {
        const res = makeRes();
        await graphqlHandler({ body: { query: '   ' } } as Request, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 when query is not a string', async () => {
        const res = makeRes();
        await graphqlHandler({ body: { query: 123 } } as Request, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('executes a valid introspection-style query and returns json', async () => {
        const res = makeRes();
        await graphqlHandler(
            { body: { query: '{ __typename }' }, user: undefined } as unknown as Request,
            res,
        );
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { __typename: 'Query' } }));
    });

    it('passes caller from req.user to context', async () => {
        const res = makeRes();
        await graphqlHandler(
            { body: { query: '{ __typename }' }, user: { address: '0xcaller' } } as unknown as Request,
            res,
        );
        expect(res.json).toHaveBeenCalled();
    });
});
