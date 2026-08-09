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

/**
 * Chat sending is the only endpoint in the API that produces content another player
 * receives, so its budget is a moderation control as much as a cost one: 20/min is
 * conversational speed and well short of flooding someone's thread. It is also the
 * *only* such control in v1 — there is no block, report, or filter yet (roadmap §2).
 */
export const chatSendRateLimit = rateLimit({
    windowMs: 60_000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: walletKey,
    message: { error: 'Sending too fast, try again shortly' },
});

/**
 * Reading is indexed queries against the caller's own threads, so it only needs to be
 * loose enough for a client that polls between socket updates and re-reads on focus.
 */
export const chatReadRateLimit = rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: walletKey,
    message: { error: 'Too many chat requests, try again shortly' },
});

/**
 * Room creation is a single cheap insert (no LLM), so it gets a much looser
 * budget than dialogue — just enough to stop room-spam from repeated
 * Start Battle clicks/retries.
 */
export const battleRoomRateLimit = rateLimit({
    windowMs: 60_000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: walletKey,
    message: { error: 'Too many battle room requests, try again shortly' },
});

/**
 * Inventory writes each send a transaction and wait for its receipt, so the real limit is
 * block time rather than server cost. A tight budget here is about the wallet: every call
 * spends gas from the backend's own key, and a loop of failed uses would drain it whether
 * or not anything settled.
 */
export const inventoryWriteRateLimit = rateLimit({
    windowMs: 60_000,
    limit: 15,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: walletKey,
    message: { error: 'Too many item actions, try again shortly' },
});
