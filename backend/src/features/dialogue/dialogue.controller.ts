import type { Request, Response } from 'express';
import { getOrGenerateDialogue, getOrGenerateTaunts } from './dialogue.service';
import { DialogueRequestSchema, TauntsRequestSchema } from './dialogue.schema';

/**
 * POST /api/battle-dialogue/taunts — generate the pre-fight taunts for a matchup.
 * AI-only (no templated fallback): on failure it returns 502 so the client knows
 * the banter is unavailable. Side effect: kicks off result pregen for both
 * outcomes so the post-battle result read is served instantly.
 */
export async function generateBattleTaunts(req: Request, res: Response): Promise<void> {
    const parsed = TauntsRequestSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'Invalid battle taunts request' });
        return;
    }

    try {
        const result = await getOrGenerateTaunts(parsed.data);
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
    const parsed = DialogueRequestSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'Invalid battle dialogue request' });
        return;
    }

    try {
        const result = await getOrGenerateDialogue(parsed.data);
        res.json(result);
    } catch (err) {
        console.error('[dialogue] generation failed:', err);
        res.status(500).json({ error: 'Failed to generate battle dialogue' });
    }
}