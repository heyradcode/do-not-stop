import express, { Router } from 'express';

import { deleteDefenseAuthorizations, postBattleIntent, postDefenseAuthorization } from '@features/battle-ledger';
import { verifyToken } from '@middleware/auth';
import { battleRoomRateLimit } from '@middleware/rateLimit';

const router: Router = express.Router();

// The JWT identifies the caller; the wallet signature inside the body is what authorizes
// the battle (§D). Rate limiting runs after verifyToken so the budget is per wallet rather
// than per IP, which is what makes it a per-wallet submission limit (threat T5).
router.post('/intents', verifyToken, battleRoomRateLimit, postBattleIntent);

// Standing defence consent. Submission is signed by the defender's wallet; revocation needs
// only the JWT, because refusing battles is never the dangerous direction.
router.post('/authorizations', verifyToken, battleRoomRateLimit, postDefenseAuthorization);
router.delete('/authorizations', verifyToken, deleteDefenseAuthorizations);

export default router;
