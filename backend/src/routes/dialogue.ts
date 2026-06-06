import express, { Router } from 'express';
import { verifyToken } from '@middleware/auth';
import { postBattleDialogue, postBattleTaunts } from '@features/dialogue';

const router: Router = express.Router();

router.post('/taunts', verifyToken, postBattleTaunts);
router.post('/', verifyToken, postBattleDialogue);

export default router;
