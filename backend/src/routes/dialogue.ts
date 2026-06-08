import express, { Router } from 'express';
import { verifyToken } from '@middleware/auth';
import { generateBattleDialogue, generateBattleTaunts } from '@features/dialogue';

const router: Router = express.Router();

router.post('/taunts', verifyToken, generateBattleTaunts);
router.post('/', verifyToken, generateBattleDialogue);

export default router;
