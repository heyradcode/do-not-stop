import { z } from 'zod';
import { SUPPORTED_CHAINS } from '@typings/chain';

/** Body of POST /api/battle-room. Just enough to identify the matchup — unlike
 *  the dialogue endpoints, a room has no persona/AI content to build. */
export const CreateRoomRequestSchema = z.object({
    chain: z.enum(SUPPORTED_CHAINS),
    attackerPetId: z.string().min(1),
    defenderPetId: z.string().min(1),
});
