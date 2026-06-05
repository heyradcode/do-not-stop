import express, { Router } from 'express';
import { verifyToken } from '@middleware/auth';
import { postBattleDialogue, postBattleTaunts, postPrepareDialogue } from '@features/dialogue/dialogue.controller';

const router: Router = express.Router();

router.post('/prepare', verifyToken, postPrepareDialogue);
router.post('/taunts', verifyToken, postBattleTaunts);
router.post('/', verifyToken, postBattleDialogue);

export default router;
