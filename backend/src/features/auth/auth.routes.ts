import express, { Router } from 'express';
import { getNonce, verify } from './auth.controller';

const router: Router = express.Router();

router.get('/nonce', getNonce);
router.post('/verify', verify);

export default router;
