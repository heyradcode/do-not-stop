import type { Request, Response } from 'express';
import { getOrGenerateDialogue } from './result.service';
import { generateTaunts, streamTauntsConversation } from './taunts.service';
import { ResultRequestSchema, TauntsRequestSchema } from './dialogue.schema';

/**
 * POST /api/battle-dialogue/taunts — generate the pre-fight taunts for a matchup.
 * AI-only (no templated fallback): on failure it returns 502 so the client knows
 * the banter is unavailable. Side effect: kicks off result pregen for both
 * outcomes so the post-battle result read is served instantly.
 */
export async function generateBattleTaunts(req: Request, res: Response): Promise<void> {
    const tauntsRequest = TauntsRequestSchema.safeParse(req.body);
    if (!tauntsRequest.success) {
        res.status(400).json({ error: 'Invalid battle taunts request' });
        return;
    }

    try {
        const result = await generateTaunts(tauntsRequest.data);
        res.json(result);
    } catch (err) {
        console.error('[dialogue] taunt generation failed:', err);
        res.status(502).json({ error: 'Failed to generate battle taunts' });
    }
}

/**
 * POST /api/battle-dialogue/taunts/stream — same as /taunts but streams the lines
 * as they generate, one NDJSON object ({ turns }) per line, so the client can
 * reveal them progressively. Clients that can't read a streamed body (e.g. React
 * Native) get the same NDJSON in one shot and use the final line. Errors before
 * the first chunk return 502; mid-stream failures end the (already-200) response.
 */
export async function streamBattleTaunts(req: Request, res: Response): Promise<void> {
    const tauntsRequest = TauntsRequestSchema.safeParse(req.body);
    if (!tauntsRequest.success) {
        res.status(400).json({ error: 'Invalid battle taunts request' });
        return;
    }

    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no'); // don't let a proxy buffer the stream

    try {
        for await (const turns of streamTauntsConversation(tauntsRequest.data)) {
            res.write(`${JSON.stringify({ turns })}\n`);
        }
        res.end();
    } catch (err) {
        console.error('[dialogue] taunt streaming failed:', err);
        if (res.headersSent) {
            res.end();
        } else {
            res.status(502).json({ error: 'Failed to generate battle taunts' });
        }
    }
}

/**
 * POST /api/battle-dialogue/result — idempotent: first call generates and stores the
 * conversation, later calls for the same battleId return the cached one.
 */
export async function resolveBattleDialogue(req: Request, res: Response): Promise<void> {
    const dialogueRequest = ResultRequestSchema.safeParse(req.body);
    if (!dialogueRequest.success) {
        res.status(400).json({ error: 'Invalid battle dialogue request' });
        return;
    }

    try {
        const result = await getOrGenerateDialogue(dialogueRequest.data);
        res.json(result);
    } catch (err) {
        console.error('[dialogue] generation failed:', err);
        res.status(500).json({ error: 'Failed to generate battle dialogue' });
    }
}