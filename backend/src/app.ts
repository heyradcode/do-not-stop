import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import authRoutes from './routes/auth';
import protectedRoutes from './routes/protected';
import healthRoutes from './routes/health';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/protected', protectedRoutes);
app.use('/api/health', healthRoutes);

app.get('/', (req: Request, res: Response) => {
    res.json({
        message: 'Web3 Authentication API',
        version: '1.0.0',
        endpoints: {
            auth: '/api/auth',
            protected: '/api/protected',
            health: '/api/health',
        },
    });
});

export default app;
