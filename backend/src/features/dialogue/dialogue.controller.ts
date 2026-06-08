import type { Request, Response } from 'express';
import { getOrGenerateDialogue, generateTaunts } from './dialogue.service';
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