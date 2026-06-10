import type { Request } from 'express';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import type { AuthenticatedRequest } from './auth';

/**
 * Per-route rate limits. In-memory windows (same single-instance trade-off as
 * the nonce store) — swap in a Redis store via express-rate-limit's `store`
 * option when running multiple instances.
 */

/**
 * Auth endpoints are unauthenticated, so the only stable key is the client IP.
 * A login costs two requests (nonce + verify); 20/min leaves room for retries
 * while making signature brute-forcing impractical.
 */
export const authRateLimit = rateLimit({
    windowMs: 60_000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many auth attempts, try again shortly' },
});

/** Key by the authenticated wallet (set by verifyToken); IP before auth ran. */
function walletKey(req: Request): string {
    const address = (req as AuthenticatedRequest).user?.address;
    return address ?? ipKeyGenerator(req.ip ?? '');
}

/**
 * Dialogue endpoints fan out to a paid LLM, so they get the tightest budget:
 * a battle consumes one taunt stream + one result read, and generation itself
 * takes seconds — 10/min per wallet caps cost without touching honest play.
 */
export const dialogueRateLimit = rateLimit({
    windowMs: 60_000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: walletKey,
    message: { error: 'Too many dialogue requests, try again shortly' },
});
