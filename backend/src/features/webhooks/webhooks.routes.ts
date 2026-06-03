import express, { Router } from 'express';
import { postHeliusWebhook } from './webhooks.controller';

const router: Router = express.Router();

router.post('/helius', postHeliusWebhook);

export default router;
