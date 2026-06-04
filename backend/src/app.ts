import express, { Request, Response } from 'express';
import cors from 'cors';

import { env } from '@config/env';
import { verifyToken } from '@middleware/auth';
import authRoutes from '@features/auth/auth.routes';
import protectedRoutes from '@features/protected/protected.routes';
import healthRoutes from '@features/health/health.routes';
import { graphqlHandler } from '@graphql';
import webhookRoutes from '@solana/webhooks/routes';

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
app.post('/graphql', verifyToken, graphqlHandler);
app.use('/api/webhooks', webhookRoutes);

app.get('/', (_req: Request, res: Response) => {
    res.json({
        message: 'CryptoPets API',
        version: '1.0.0',
        endpoints: {
            auth: '/api/auth',
            protected: '/api/protected',
            health: '/api/health',
            graphql: '/graphql',
            webhooks: '/api/webhooks',
        },
    });
});

export default app;
