import express, { Router } from 'express';
import { authRateLimit } from '@middleware/rateLimit';
import { getNonce, verify } from '@features/auth/auth.controller';

const router: Router = express.Router();

router.use(authRateLimit);
router.get('/nonce', getNonce);
router.post('/verify', verify);

export default router;
