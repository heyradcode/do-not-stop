import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import authRoutes from './routes/auth';
import protectedRoutes from './routes/protected';
import healthRoutes from './routes/health';
import battleRoutes from './routes/battle';

dotenv.config();

const app = express();

const corsOrigin = process.env.CORS_ORIGIN;
app.use(
    cors(
        corsOrigin
            ? {
                  origin: corsOrigin.split(',').map((origin) => origin.trim()),
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
