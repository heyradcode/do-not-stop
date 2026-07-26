import express, { Request, Response } from 'express';
import cors from 'cors';

import { env } from '@config/env';
import authRoutes from '@routes/auth';
import healthRoutes from '@routes/health';
import protectedRoutes from '@routes/protected';
import graphqlRoutes from '@routes/graphql';
import dialogueRoutes from '@routes/dialogue';
import battleRoomRoutes from '@routes/battle-room';
import battleRoutes from '@routes/battle';

const app = express();

// One hop in front of us in production (Render's proxy) — makes req.ip the
// real client address, which the per-IP rate limits key on.
app.set('trust proxy', 1);

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
app.use('/api/battle-dialogue', dialogueRoutes);
app.use('/api/battle-room', battleRoomRoutes);
app.use('/api/battle', battleRoutes);

app.get('/', (_req: Request, res: Response) => {
    res.json({
        message: 'CryptoPets API',
        version: '1.0.0',
        endpoints: {
            auth: '/api/auth',
            protected: '/api/protected',
            health: '/api/health',
            graphql: '/graphql',
            battleDialogue: '/api/battle-dialogue',
            battleRoom: '/api/battle-room',
        },
    });
});

export default app;
