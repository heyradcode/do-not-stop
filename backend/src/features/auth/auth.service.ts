import jwt from 'jsonwebtoken';
import { ethers } from 'ethers';
import { env } from '@config/env';
import { isEvmAddress } from '@utils';
import { verifySolanaSignature } from './solana';
import type { User } from './auth.types';

/** In-memory storage for demo (use database in production). */
export const users = new Map<string, User>();

export function verifyWalletSignature(
    address: string,
    signature: string,
    nonce: string
): { ok: true; storageKey: string } | { ok: false; error: string } {
    const message = `Sign this message to authenticate: ${nonce}`;

    if (isEvmAddress(address)) {
        const recoveredAddress = ethers.verifyMessage(message, signature);
        if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
            return { ok: false, error: 'Invalid signature' };
        }
        return { ok: true, storageKey: address.toLowerCase() };
    }

    if (!verifySolanaSignature(address, signature, message)) {
        return { ok: false, error: 'Invalid signature' };
    }
    return { ok: true, storageKey: address };
}

export function upsertUser(storageKey: string): User {
    let user = users.get(storageKey);
    if (!user) {
        user = {
            address: storageKey,
            createdAt: new Date().toISOString(),
            lastLogin: new Date().toISOString(),
        };
        users.set(storageKey, user);
        return user;
    }

    user.lastLogin = new Date().toISOString();
    users.set(storageKey, user);
    return user;
}

export function issueToken(storageKey: string): string {
    return jwt.sign(
        {
            address: storageKey,
            userId: storageKey,
        },
        env.jwtSecret,
        { expiresIn: '24h' }
    );
}

export function getUserCount(): number {
    return users.size;
}
