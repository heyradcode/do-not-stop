import express, { Request, Response, Router } from 'express';
import { users } from './auth';

const router: Router = express.Router();

interface HealthResponse {
    status: string;
    timestamp: string;
    users: number;
}

// Health check endpoint
router.get('/', (req: Request, res: Response) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        users: users.size,
        message: 'Backend is running with TypeScript!'
    });
});

export default router;
