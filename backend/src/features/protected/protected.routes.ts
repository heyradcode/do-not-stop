import express, { Router } from 'express';
import { verifyToken } from '../../middleware/auth';
import { getProfile, getUsers } from './protected.controller';

const router: Router = express.Router();

router.use(verifyToken);
router.get('/profile', getProfile);
router.get('/users', getUsers);

export default router;
