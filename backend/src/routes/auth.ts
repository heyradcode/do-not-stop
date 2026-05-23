import express, { Request, Response, Router } from 'express';
import jwt from 'jsonwebtoken';
import { ethers } from 'ethers';
import bs58 from 'bs58';
import nacl from 'tweetnacl';

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
        chainId?: number;
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

function isEvmAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/i.test(address);
}

const ED25519_SIG_LEN = 64;

/** Accept base58 (canonical from our client), raw hex, or base64 (common from Dynamic). */
function decodeSolanaSignatureWire(signature: string): Uint8Array | null {
    const t = signature.trim();
    const hex = t.startsWith('0x') || t.startsWith('0X') ? t.slice(2) : t;
    if (/^[0-9a-fA-F]{128}$/i.test(hex)) {
        try {
            const out = Buffer.from(hex, 'hex');
            if (out.length === ED25519_SIG_LEN) {
                return new Uint8Array(out);
            }
        } catch {
            /* fall through */
        }
    }
    try {
        const decoded = bs58.decode(t);
        if (decoded.length === ED25519_SIG_LEN) {
            return new Uint8Array(decoded);
        }
    } catch {
        /* fall through */
    }
    try {
        const buf = Buffer.from(t, 'base64');
        if (buf.length === ED25519_SIG_LEN) {
            return new Uint8Array(buf);
        }
    } catch {
        /* fall through */
    }
    return null;
}

function verifySolanaSignature(address: string, signatureWire: string, message: string): boolean {
    try {
        const pubKey = new Uint8Array(bs58.decode(address));
        if (pubKey.length !== 32) {
            return false;
        }
        const sig = decodeSolanaSignatureWire(signatureWire);
        if (!sig) {
            return false;
        }
        const msgBytes = new TextEncoder().encode(message);
        return nacl.sign.detached.verify(msgBytes, sig, pubKey);
    } catch {
        return false;
    }
}

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

        const message = `Sign this message to authenticate: ${nonce}`;

        let storageKey: string;

        if (isEvmAddress(address)) {
            const recoveredAddress = ethers.verifyMessage(message, signature);
            if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
                res.status(401).json({ error: 'Invalid signature' });
                return;
            }
            storageKey = address.toLowerCase();
        } else {
            if (!verifySolanaSignature(address, signature, message)) {
                res.status(401).json({ error: 'Invalid signature' });
                return;
            }
            storageKey = address;
        }

        // Check if user exists or create new one
        let user = users.get(storageKey);
        if (!user) {
            user = {
                address: storageKey,
                createdAt: new Date().toISOString(),
                lastLogin: new Date().toISOString()
            };
            users.set(storageKey, user);
        } else {
            user.lastLogin = new Date().toISOString();
            users.set(storageKey, user);
        }

        // Generate JWT token
        const token = jwt.sign(
            {
                address: storageKey,
                userId: storageKey
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
