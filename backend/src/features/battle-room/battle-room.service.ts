import { createRoom } from '@repositories/room.repository';
import type { CreateRoomRequestSchema } from './battle-room.schema';
import type { z } from 'zod';

export type CreateRoomInput = z.infer<typeof CreateRoomRequestSchema>;

/** Mints a room id for a matchup, owned by the requesting wallet. */
export async function mintRoom(input: CreateRoomInput, owner: string): Promise<string> {
    return createRoom({
        chain: input.chain,
        attacker: input.attackerPetId,
        defender: input.defenderPetId,
        owner,
    });
}
