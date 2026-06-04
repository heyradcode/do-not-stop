import { graphql } from 'graphql';
import type { Request, Response } from 'express';
import { schema } from './schema';
import { rootValue } from './resolvers';
import type { AuthenticatedRequest } from '@middleware/auth';

/**
 * Express POST handler for the unified GraphQL endpoint (`POST /graphql`).
 * Auth (verifyToken middleware) is applied at the route level so `req.user`
 * is already populated when this runs.
 */
export async function graphqlHandler(req: Request, res: Response): Promise<void> {
    const body = req.body as { query?: unknown; variables?: unknown };

    if (typeof body.query !== 'string' || !body.query.trim()) {
        res.status(400).json({ errors: [{ message: 'Missing or empty query' }] });
        return;
    }

    const caller = (req as AuthenticatedRequest).user?.address ?? '';
    const variables =
        body.variables != null && typeof body.variables === 'object'
            ? (body.variables as Record<string, unknown>)
            : undefined;

    try {
        const result = await graphql({
            schema,
            source: body.query,
            rootValue,
            contextValue: { caller },
            variableValues: variables,
        });
        res.json(result);
    } catch (err) {
        res.status(500).json({ errors: [{ message: (err as Error).message }] });
    }
}
