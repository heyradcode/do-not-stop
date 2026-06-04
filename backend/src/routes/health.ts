import express, { Router } from 'express';
import { getHealth } from '@features/health/health.controller';

const router: Router = express.Router();

router.get('/', getHealth);

export default router;
