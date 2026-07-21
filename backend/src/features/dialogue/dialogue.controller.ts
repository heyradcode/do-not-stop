import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from '@middleware/auth';
import { getPetById } from '@repositories/roster.repository';
import { ChainTruthMismatchError, getOrGenerateDialogue } from './result/result.service';
import { streamTauntsConversation } from './taunt/taunt.service';
import { ResultRequestSchema, TauntsRequestSchema } from './dialogue.schema';
import type { Chain } from '@typings/chain';
import type { GenerateDialogueInput } from './dialogue.types';

/**
 * POST /api/battle-dialogue/taunts/stream — generate the pre-fight taunts for a
 * matchup, streaming the lines as they generate: one NDJSON object ({ turns }) per
 * line, so the client can reveal them progressively. Clients that can't read a
 * streamed body (e.g. React Native) get the same NDJSON in one shot and use the
 * final line. AI-only (no templated fallback). Errors before the first chunk
 * return 502; mid-stream failures end the (already-200) response. Side effect:
 * kicks off result pregen for both outcomes so the post-battle result read is
 * served instantly.
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

    const caller = (req as AuthenticatedRequest).user?.address;
    if (!caller || !(await callerOwnsMatchup(dialogueRequest.data, caller))) {
        res.status(403).json({ error: 'Not a participant in this battle' });
        return;
    }

    try {
        const result = await getOrGenerateDialogue(dialogueRequest.data);
        res.json(result);
    } catch (err) {
        if (err instanceof ChainTruthMismatchError) {
            console.warn(`[dialogue] rejected result for ${dialogueRequest.data.chain}:${dialogueRequest.data.battleId}: ${err.message}`);
            res.status(409).json({ error: 'Reported winner contradicts the on-chain result' });
            return;
        }
        console.error('[dialogue] generation failed:', err);
        res.status(500).json({ error: 'Failed to generate battle dialogue' });
    }
}

/**
 * Only the attacker's or defender's registered owner may submit a battle's result.
 * `battleId` becomes public the instant a battle settles on-chain, so without this
 * check any authenticated wallet could race the real participant and submit a forged
 * winner first — the result cache is first-write-wins, so that would stick.
 */
async function callerOwnsMatchup(input: GenerateDialogueInput, caller: string): Promise<boolean> {
    const [attacker, defender] = await Promise.all([
        getPetById(input.chain, input.attacker.petId),
        getPetById(input.chain, input.defender.petId),
    ]);
    return [attacker?.owner, defender?.owner].some(
        (owner) => owner != null && addressesMatch(input.chain, owner, caller),
    );
}

function addressesMatch(chain: Chain, a: string, b: string): boolean {
    // EVM addresses are case-insensitive; Solana pubkeys are base58 and case-sensitive.
    return chain === 'evm' ? a.toLowerCase() === b.toLowerCase() : a === b;
}