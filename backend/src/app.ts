import express, { Request, Response } from 'express';
import cors from 'cors';

import { env } from '@config/env';
import authRoutes from '@routes/auth';
import healthRoutes from '@routes/health';
import protectedRoutes from '@routes/protected';
import graphqlRoutes from '@routes/graphql';
import webhookRoutes from '@routes/webhooks';
import battleDialogueRoutes from '@routes/battle-dialogue';

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
app.use('/graphql', graphqlRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/battle-dialogue', battleDialogueRoutes);

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
            battleDialogue: '/api/battle-dialogue',
        },
    });
});

export default app;
