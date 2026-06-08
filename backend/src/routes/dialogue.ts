import express, { Router } from 'express';
import { verifyToken } from '@middleware/auth';
import { resolveBattleDialogue, generateBattleTaunts, streamBattleTaunts } from '@features/dialogue';

const router: Router = express.Router();

router.post('/taunts', verifyToken, generateBattleTaunts);
router.post('/taunts/stream', verifyToken, streamBattleTaunts);
router.post('/result', verifyToken, resolveBattleDialogue);

export default router;
