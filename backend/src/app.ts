import express, { Request, Response } from 'express';
import cors from 'cors';

import { env } from './config/env';
import authRoutes from './features/auth/auth.routes';
import protectedRoutes from './features/protected/protected.routes';
import healthRoutes from './features/health/health.routes';
import battleRoutes from './features/battle/battle.routes';

const app = express();

app.use(
    cors(
        env.corsOrigin
            ? {
                  origin: env.corsOrigin.split(',').map((origin) => origin.trim()),
              }
            : undefined
    )
);
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/protected', protectedRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/battle', battleRoutes);

app.get('/', (req: Request, res: Response) => {
    res.json({
        message: 'Web3 Authentication API',
        version: '1.0.0',
        endpoints: {
            auth: '/api/auth',
            protected: '/api/protected',
            health: '/api/health',
            battle: '/api/battle',
        },
    });
});

export default app;
