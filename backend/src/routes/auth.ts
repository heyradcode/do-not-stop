import express, { Request, Response, Router } from 'express';
import jwt from 'jsonwebtoken';
import { ethers } from 'ethers';

const router: Router = express.Router();

interface User {
    address: string;
    createdAt: string;
    lastLogin: string;
}

interface AuthRequest extends Request {
    body: {
        address: string;
        signature: string;
        nonce: string;
    };
}

interface NonceResponse {
    nonce: string;
}

interface VerifyResponse {
    success: boolean;
    token: string;
    user: {
        address: string;
        createdAt: string;
        lastLogin: string;
    };
}

interface ErrorResponse {
    error: string;
}

// In-memory storage for demo (use database in production)
const users = new Map<string, User>();

// Generate nonce for signing
router.get('/nonce', (req: Request, res: Response) => {
    const nonce = Math.random().toString(36).substring(2, 15) +
        Math.random().toString(36).substring(2, 15);

    res.json({ nonce });
});

// Verify signature and issue JWT
router.post('/verify', async (req: AuthRequest, res: Response) => {
    try {
        const { address, signature, nonce } = req.body;

        if (!address || !signature || !nonce) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
        }

        // Recover the address from the signature
        const message = `Sign this message to authenticate: ${nonce}`;
        const recoveredAddress = ethers.verifyMessage(message, signature);

        if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
            res.status(401).json({ error: 'Invalid signature' });
            return;
        }

        // Check if user exists or create new one
        let user = users.get(address.toLowerCase());
        if (!user) {
            user = {
                address: address.toLowerCase(),
                createdAt: new Date().toISOString(),
                lastLogin: new Date().toISOString()
            };
            users.set(address.toLowerCase(), user);
        } else {
            user.lastLogin = new Date().toISOString();
            users.set(address.toLowerCase(), user);
        }

        // Generate JWT token
        const token = jwt.sign(
            {
                address: address.toLowerCase(),
                userId: address.toLowerCase()
            },
            process.env.JWT_SECRET || 'fallback-secret-key',
            { expiresIn: '24h' }
        );

        res.json({
            success: true,
            token,
            user: {
                address: user.address,
                createdAt: user.createdAt,
                lastLogin: user.lastLogin
            }
        });

    } catch {
        res.status(500).json({ error: 'Internal server error' });
    }
});

export { users };
export default router;
