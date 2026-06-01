import type { Request, Response } from 'express';
import { getUserCount } from '@features/auth/auth.service';

interface HealthResponse {
    status: string;
    timestamp: string;
    users: number;
    message: string;
}

export function getHealth(_req: Request, res: Response<HealthResponse>): void {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        users: getUserCount(),
        message: 'Backend is running with TypeScript!',
    });
}
