import express, { Router } from 'express';
import { verifyToken } from '../../middleware/auth';
import { getOpponents } from './battle.controller';

const router: Router = express.Router();

router.use(verifyToken);
router.get('/opponents', getOpponents);

export default router;
