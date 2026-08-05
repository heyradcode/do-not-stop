import { prisma } from '@config/prisma';
import type { Chain } from '@typings/chain';

/**
 * Shareable room URLs (battle_room) — a stable id minted at Start Battle time,
 * before any on-chain identifier (tx hash / requestId) exists. See BattleRoom
 * in schema.prisma for why this is separate from battle_history/battle_dialogue.
 */

export interface CreateRoomInput {
    chain: Chain;
    attacker: string;
    defender: string;
    owner: string;
}

/** Mints a new room id for a matchup. Always creates a fresh row — rooms are
 *  cheap and per-attempt, not deduplicated across repeated Start Battle clicks. */
export async function createRoom(input: CreateRoomInput): Promise<string> {
    const room = await prisma.battleRoom.create({
        data: {
            chain: input.chain,
            attacker: input.attacker,
            defender: input.defender,
            owner: input.owner,
        },
        select: { id: true },
    });
    return room.id;
}
