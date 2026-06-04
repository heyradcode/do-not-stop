import type { Request, Response } from 'express';
import { handleHeliusWebhook, isAuthorized, isSolanaConfigured } from './service';

/**
 * POST /api/webhooks/helius — Helius push endpoint for Solana `PetAccount`
 * updates. Verifies the shared secret, then decodes the touched accounts into
 * `pet_roster`. Always responds quickly so Helius doesn't retry on slow work;
 * decode/upsert errors are logged, not surfaced (the periodic scan reconciles).
 */
export async function postHeliusWebhook(req: Request, res: Response): Promise<void> {
    if (!isSolanaConfigured()) {
        res.status(503).json({ error: 'Solana indexing not configured' });
        return;
    }

    if (!isAuthorized(req.header('authorization'))) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    // Ack first — Helius treats a non-2xx (or slow) response as a failed
    // delivery and retries; the work below is idempotent (keyed upsert).
    res.status(200).json({ ok: true });

    try {
        const { updated } = await handleHeliusWebhook(req.body);
        if (updated > 0) {
            console.log(`[webhook] helius: upserted ${updated} solana pet(s)`);
        }
    } catch (err) {
        console.error('[webhook] helius processing failed:', (err as Error).message);
    }
}
