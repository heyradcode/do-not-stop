import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

/** Request augmented with the verified JWT payload. */
export interface AuthenticatedRequest extends Request {
    user?: {
        address: string;
        userId: string;
    };
}

/**
 * Express middleware that verifies the `Authorization: Bearer <jwt>` header and
 * attaches the decoded payload to `req.user`. Shared by battle and protected routes.
 */
export const verifyToken = (
    req: Request,
    res: Response<{ error: string }>,
    next: NextFunction
): void => {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        res.status(401).json({ error: 'No token provided' });
        return;
    }

    try {
        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET || 'fallback-secret-key'
        ) as { address: string; userId: string };
        (req as AuthenticatedRequest).user = decoded;
        next();
    } catch {
        res.status(401).json({ error: 'Invalid token' });
    }
};
