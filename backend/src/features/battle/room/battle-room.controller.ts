import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from '@middleware/auth';
import { mintRoom } from './battle-room.service';
import { CreateRoomRequestSchema } from './battle-room.schema';

/**
 * POST /api/battle-room — mints a shareable room id for a matchup, called at
 * Start Battle time (before the wallet signs, so no on-chain identifier exists
 * yet). The frontend routes to /battle/:roomId once this returns.
 */
export async function createBattleRoom(req: Request, res: Response): Promise<void> {
    const parsed = CreateRoomRequestSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'Invalid battle room request' });
        return;
    }

    const owner = (req as AuthenticatedRequest).user?.address;
    if (!owner) {
        res.status(401).json({ error: 'No token provided' });
        return;
    }

    try {
        const roomId = await mintRoom(parsed.data, owner);
        res.json({ roomId });
    } catch (err) {
        console.error('[battle-room] failed to create room:', err);
        res.status(500).json({ error: 'Failed to create battle room' });
    }
}
