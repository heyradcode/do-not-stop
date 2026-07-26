import express, { Router } from 'express';

import {
    deleteDefenseAuthorizations,
    postAcceptBattle,
    postBattleIntent,
    postDefenseAuthorization,
} from '@features/battle-ledger';
import { verifyToken } from '@middleware/auth';
import { battleRoomRateLimit } from '@middleware/rateLimit';

const router: Router = express.Router();

// The JWT identifies the caller; the wallet signature inside the body is what authorizes
// the battle (§D). Rate limiting runs after verifyToken so the budget is per wallet rather
// than per IP, which is what makes it a per-wallet submission limit (threat T5).
router.post('/intents', verifyToken, battleRoomRateLimit, postBattleIntent);

// The commit-before-reveal moment (§E): the round is chosen and the commitment signed here,
// synchronously, and handed back in this same response.
router.post('/intents/:intentHash/accept', verifyToken, battleRoomRateLimit, (req, res) => {
    req.body = { ...req.body, intentHash: req.params.intentHash };
    return postAcceptBattle(req, res);
});

// Standing defence consent. Submission is signed by the defender's wallet; revocation needs
// only the JWT, because refusing battles is never the dangerous direction.
router.post('/authorizations', verifyToken, battleRoomRateLimit, postDefenseAuthorization);
router.delete('/authorizations', verifyToken, deleteDefenseAuthorizations);

export default router;
