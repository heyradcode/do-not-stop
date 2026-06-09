import express, { Router } from 'express';
import { verifyToken } from '@middleware/auth';
import { resolveBattleDialogue, streamBattleTaunts } from '@features/dialogue';

const router: Router = express.Router();

router.post('/taunts/stream', verifyToken, streamBattleTaunts);
router.post('/result', verifyToken, resolveBattleDialogue);

export default router;
