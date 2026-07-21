import type { Request, Response } from 'express';

interface HealthResponse {
    status: string;
    timestamp: string;
    message: string;
}

/**
 * Liveness probe for Render / load balancers. Must return 200 immediately —
 * never await Postgres or other I/O here (a hung pool stalls the deploy).
 */
export function getHealth(_req: Request, res: Response<HealthResponse>): void {
    res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        message: 'Backend is running with TypeScript!',
    });
}
