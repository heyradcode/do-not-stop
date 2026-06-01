import express, { Router } from 'express';
import { getHealth } from './health.controller';

const router: Router = express.Router();

router.get('/', getHealth);

export default router;
