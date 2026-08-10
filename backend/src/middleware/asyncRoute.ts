import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Routes a rejected async handler into Express's error middleware.
 *
 * Express 4 does not await handlers. It calls one, ignores the promise it returns, and
 * moves on, so a rejection from an `async` handler is an unhandled rejection rather than a
 * 500 — and Node 24 exits the process on those by default. The practical effect is that
 * every async route is one throw away from taking the server down for every user, which a
 * single failed battle accept demonstrated.
 *
 * The error middleware in `app.ts` is the other half: this puts the error on the chain,
 * that turns it into a response. Neither works without the other.
 *
 * Express 5 awaits handlers natively and makes this unnecessary. Until that upgrade, wrap
 * anything async.
 */
export function asyncRoute(
    handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
    return (req, res, next) => {
        handler(req, res, next).catch(next);
    };
}
