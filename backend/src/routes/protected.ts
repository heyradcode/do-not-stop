import express, { Request, Response, NextFunction, Router } from 'express';
import jwt from 'jsonwebtoken';
import { users } from './auth';

const router: Router = express.Router();

interface AuthenticatedRequest extends Request {
    user?: {
        address: string;
        userId: string;
    };
}

interface ErrorResponse {
    error: string;
}

interface ProfileResponse {
    success: boolean;
    user: {
        address: string;
        createdAt: string;
        lastLogin: string;
    };
}

interface UsersResponse {
    success: boolean;
    users: Array<{
        address: string;
        createdAt: string;
        lastLogin: string;
    }>;
    total: number;
}

// Middleware to verify JWT
const verifyToken = (req: Request, res: Response<ErrorResponse>, next: NextFunction): void => {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        res.status(401).json({ error: 'No token provided' });
        return;
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-key') as { address: string; userId: string };
        (req as AuthenticatedRequest).user = decoded;
        next();
    } catch {
        res.status(401).json({ error: 'Invalid token' });
    }
};

// Apply JWT verification to all protected routes
router.use(verifyToken);

// Protected route example
router.get('/profile', (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const user = users.get(authReq.user?.address || '');

    if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
    }

    res.json({
        success: true,
        user: {
            address: user.address,
            createdAt: user.createdAt,
            lastLogin: user.lastLogin
        }
    });
});

// Get all users (for demo purposes)
router.get('/users', (req: Request, res: Response) => {
    const userList = Array.from(users.values());
    res.json({
        success: true,
        users: userList,
        total: userList.length
    });
});

export default router;
