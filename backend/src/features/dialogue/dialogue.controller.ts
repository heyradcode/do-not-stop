import type { Request, Response } from 'express';
import type { Chain } from '@typings/chain';
import { getOrGenerateDialogue, getOrGenerateTaunts } from './dialogue.service';
import type {
    DialogueSpeaker,
    GenerateDialogueInput,
    GenerateTauntsInput,
    PetPersonaInput,
} from './dialogue.types';

function parsePet(value: unknown): PetPersonaInput | null {
    if (!value || typeof value !== 'object') return null;
    const v = value as Record<string, unknown>;
    if (
        typeof v.petId !== 'string' ||
        typeof v.name !== 'string' ||
        typeof v.level !== 'number' ||
        typeof v.rarity !== 'number' ||
        typeof v.dna !== 'string' ||
        typeof v.winCount !== 'number' ||
        typeof v.lossCount !== 'number'
    ) {
        return null;
    }
    return {
        petId: v.petId,
        name: v.name,
        level: v.level,
        rarity: v.rarity,
        dna: v.dna,
        winCount: v.winCount,
        lossCount: v.lossCount,
    };
}

function parseInput(body: unknown): GenerateDialogueInput | null {
    if (!body || typeof body !== 'object') return null;
    const b = body as Record<string, unknown>;

    const chain = b.chain;
    if (chain !== 'evm' && chain !== 'solana') return null;
    if (typeof b.battleId !== 'string' || b.battleId.length === 0) return null;

    const winner = b.winner;
    if (winner !== 'attacker' && winner !== 'defender') return null;

    const attacker = parsePet(b.attacker);
    const defender = parsePet(b.defender);
    if (!attacker || !defender) return null;

    return {
        chain: chain as Chain,
        battleId: b.battleId,
        attacker,
        defender,
        winner: winner as DialogueSpeaker,
        ...(typeof b.leveledUp === 'boolean' ? { leveledUp: b.leveledUp } : {}),
    };
}

function parseTauntInput(body: unknown): GenerateTauntsInput | null {
    if (!body || typeof body !== 'object') return null;
    const b = body as Record<string, unknown>;

    const chain = b.chain;
    if (chain !== 'evm' && chain !== 'solana') return null;

    const attacker = parsePet(b.attacker);
    const defender = parsePet(b.defender);
    if (!attacker || !defender) return null;

    return { chain: chain as Chain, attacker, defender };
}

/**
 * POST /api/battle-dialogue — idempotent: first call generates and stores the
 * conversation, later calls for the same battleId return the cached one.
 */
export async function postBattleDialogue(req: Request, res: Response): Promise<void> {
    const input = parseInput(req.body);
    if (!input) {
        res.status(400).json({ error: 'Invalid battle dialogue request' });
        return;
    }

    try {
        const result = await getOrGenerateDialogue(input);
        res.json(result);
    } catch (err) {
        console.error('[dialogue] generation failed:', err);
        res.status(500).json({ error: 'Failed to generate battle dialogue' });
    }
}

/**
 * POST /api/battle-dialogue/taunts — generate the pre-fight taunts for a matchup.
 * AI-only (no templated fallback): on failure it returns 502 so the client knows
 * the banter is unavailable.
 */
export async function postBattleTaunts(req: Request, res: Response): Promise<void> {
    const input = parseTauntInput(req.body);
    if (!input) {
        res.status(400).json({ error: 'Invalid battle taunts request' });
        return;
    }

    try {
        const result = await getOrGenerateTaunts(input);
        res.json(result);
    } catch (err) {
        console.error('[dialogue] taunt generation failed:', err);
        res.status(502).json({ error: 'Failed to generate battle taunts' });
    }
}
