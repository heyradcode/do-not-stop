import type { Request, Response } from 'express';
import {
    createNonce,
    issueToken,
    upsertUser,
    verifyWalletSignature,
} from './auth.service';
import type { AuthErrorResponse, AuthVerifyRequest, NonceResponse, VerifyResponse } from './auth.types';

export function getNonce(_req: Request, res: Response<NonceResponse>): void {
    res.json({ nonce: createNonce() });
}

export async function verify(
    req: AuthVerifyRequest,
    res: Response<VerifyResponse | AuthErrorResponse>
): Promise<void> {
    try {
        const { address, signature, nonce } = req.body;

        if (!address || !signature || !nonce) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
        }

        const verified = verifyWalletSignature(address, signature, nonce);
        if (!verified.ok) {
            res.status(401).json({ error: verified.error });
            return;
        }

        const user = upsertUser(verified.storageKey);
        const token = issueToken(verified.storageKey);

        res.json({
            success: true,
            token,
            user: {
                address: user.address,
                createdAt: user.createdAt,
                lastLogin: user.lastLogin,
            },
        });
    } catch {
        res.status(500).json({ error: 'Internal server error' });
    }
}
