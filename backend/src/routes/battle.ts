import express, { Router } from 'express';

import { postBattleIntent } from '@features/battle-ledger';
import { verifyToken } from '@middleware/auth';
import { battleRoomRateLimit } from '@middleware/rateLimit';

const router: Router = express.Router();

// The JWT identifies the caller; the wallet signature inside the body is what authorizes
// the battle (§D). Rate limiting runs after verifyToken so the budget is per wallet rather
// than per IP, which is what makes it a per-wallet submission limit (threat T5).
router.post('/intents', verifyToken, battleRoomRateLimit, postBattleIntent);

export default router;
