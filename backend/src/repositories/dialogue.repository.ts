import { prisma } from '@config/prisma';
import type { Chain } from '@typings/chain';
import type { DialogueSpeaker, DialogueTurn } from '@features/battle-dialogue/battle-dialogue.types';

/**
 * Data-access layer for the `battle_dialogue` table (generate-once cache).
 * The service reads here first and only calls Claude on a miss.
 */

export interface StoredDialogue {
    turns: DialogueTurn[];
    model: string;
}

export interface SaveDialogueParams {
    chain: Chain;
    battleId: string;
    attacker: string;
    defender: string;
    winner: DialogueSpeaker;
    turns: DialogueTurn[];
    model: string;
}

/** Look up a previously generated conversation, or `null` if none exists yet. */
export async function getDialogue(chain: Chain, battleId: string): Promise<StoredDialogue | null> {
    const row = await prisma.battleDialogue.findUnique({
        where: { chain_battleId: { chain, battleId } },
    });
    if (!row) return null;
    return { turns: row.turns as unknown as DialogueTurn[], model: row.model };
}

/**
 * Persist a generated conversation. Uses an upsert keyed by (chain, battleId) so
 * a rare concurrent generation can't violate the primary key.
 */
export async function saveDialogue(params: SaveDialogueParams): Promise<void> {
    const data = {
        chain: params.chain,
        battleId: params.battleId,
        attacker: params.attacker,
        defender: params.defender,
        winner: params.winner,
        turns: params.turns as unknown as object,
        model: params.model,
    };
    await prisma.battleDialogue.upsert({
        where: { chain_battleId: { chain: params.chain, battleId: params.battleId } },
        create: data,
        update: data,
    });
}
