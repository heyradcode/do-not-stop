import type { Request, Response } from 'express';
import { countUsers } from '@repositories/user.repository';
import { withFallback } from '@utils';

interface HealthResponse {
    status: string;
    timestamp: string;
    users: number;
    message: string;
}

export async function getHealth(_req: Request, res: Response<HealthResponse>): Promise<void> {
    // Best-effort: a DB hiccup must not fail the liveness probe.
    const users = await withFallback('[health] user count failed:', countUsers, -1);

    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        users,
        message: 'Backend is running with TypeScript!',
    });
}
