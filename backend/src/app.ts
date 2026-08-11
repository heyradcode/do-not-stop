import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';

import { env } from '@config/env';
import authRoutes from '@routes/auth';
import healthRoutes from '@routes/health';
import protectedRoutes from '@routes/protected';
import graphqlRoutes from '@routes/graphql';
import dialogueRoutes from '@routes/dialogue';
import battleRoomRoutes from '@routes/battle-room';
import battleRoutes from '@routes/battle';
import receiptRoutes from '@routes/receipts';
import rewardRoutes from '@routes/rewards';
import chatRoutes from '@routes/chat';
import inventoryRoutes from '@routes/inventory';

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
app.use('/api/receipts', receiptRoutes);
app.use('/api/rewards', rewardRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/inventory', inventoryRoutes);

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
            chat: '/api/chat',
        },
    });
});

/**
 * Last resort for a route that rejected.
 *
 * Express 4 does not await route handlers, so a rejected promise from an `async` one is an
 * unhandled rejection, and Node 24 exits the process on those by default. Every async
 * handler in this app is therefore one throw away from taking the whole server down for
 * every user: a single failed battle accept did exactly that.
 *
 * Registered after the routers, since Express picks error middleware by arity and by
 * position. `next` is unused but must be declared, or Express treats this as an ordinary
 * middleware and never calls it with an error.
 */
app.use((error: Error, req: Request, res: Response, _next: NextFunction) => {
    console.error(`[api] unhandled error in ${req.method} ${req.originalUrl}:`, error);
    if (res.headersSent) {
        return;
    }
    // Deliberately opaque: an internal failure's message can name tables, hashes and
    // wallets, none of which belongs in a client response.
    res.status(500).json({ error: 'Internal error' });
});

export default app;
