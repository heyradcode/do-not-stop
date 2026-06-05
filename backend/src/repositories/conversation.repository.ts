import { prisma } from '@config/prisma';
import type { Chain } from '@typings/chain';
import type { DialoguePhase, DialogueSpeaker, DialogueTurn } from '@features/dialogue/dialogue.types';

/**
 * Append-only transcript of generated dialogue lines, keyed by the fighter pair.
 * Lets us replay prior banter between two pets into future prompts (continuity /
 * callbacks). Distinct from `battle_dialogue`, which is a generate-once cache per
 * settled battle.
 */

export interface ConversationLine {
    chain: Chain;
    attacker: string;
    defender: string;
    /** null for pre-fight taunts recorded before a battle settles. */
    battleId?: string | null;
    phase: DialoguePhase;
    speaker: DialogueSpeaker;
    text: string;
}

/** Persist a batch of generated lines. Best-effort; callers should not block on it. */
export async function recordConversation(
    meta: { chain: Chain; attacker: string; defender: string; battleId?: string | null },
    turns: DialogueTurn[],
): Promise<void> {
    if (turns.length === 0) return;
    await prisma.battleConversation.createMany({
        data: turns.map((t) => ({
            chain: meta.chain,
            attacker: meta.attacker,
            defender: meta.defender,
            battleId: meta.battleId ?? null,
            phase: t.phase,
            speaker: t.speaker,
            text: t.text,
        })),
    });
}

/**
 * Recent banter between two pets (either role), most recent first, mapped back to
 * the CURRENT battle's attacker/defender perspective so the speaker label is
 * consistent with the new prompt. Excludes a battle id when replaying for it.
 */
export async function getRecentBanter(
    chain: Chain,
    attacker: string,
    defender: string,
    limit = 6,
    excludeBattleId?: string,
): Promise<DialogueTurn[]> {
    const rows = await prisma.battleConversation.findMany({
        where: {
            chain,
            OR: [
                { attacker, defender },
                { attacker: defender, defender: attacker },
            ],
            ...(excludeBattleId ? { battleId: { not: excludeBattleId } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
    });

    // Rows store speaker relative to the battle they came from; remap to the
    // current attacker/defender so "attacker" always means this caller's pet.
    return rows
        .reverse()
        .map((row) => {
            const spokenByCurrentAttacker =
                (row.attacker === attacker && row.speaker === 'attacker') ||
                (row.attacker === defender && row.speaker === 'defender');
            return {
                speaker: (spokenByCurrentAttacker ? 'attacker' : 'defender') as DialogueSpeaker,
                phase: row.phase as DialoguePhase,
                text: row.text,
            };
        });
}
