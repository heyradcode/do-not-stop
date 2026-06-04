import express, { Router } from 'express';
import { verifyToken } from '@middleware/auth';
import { graphqlHandler } from '@graphql';

const router: Router = express.Router();

router.post('/', verifyToken, graphqlHandler);

export default router;
